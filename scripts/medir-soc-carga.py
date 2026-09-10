#!/usr/bin/env python3
"""
Medições agregadas do SOC para o plano de carga do GP SST Core.

Responde as medições 1 a 4 de `MEDICOES_PENDENTES_SOC_GP_SST_CORE.md`:
  1. matrícula distinta nos CPFs repetidos  → destrava dedup por CPF+matrícula
  2. sem CPF entre os ativos                → destrava a decisão A/B/C
  3. distribuição por faixa de tamanho      → dimensiona o lote piloto
  4. distribuição por cidade                → dimensiona o de-para da emissora

CONTAR NÃO É EXTRAIR. O script:
  - mantém as linhas em memória só o tempo de incrementar contadores;
  - NUNCA grava linha nominal em disco;
  - transforma CPF em SHA-256 antes de qualquer comparação — nem em memória
    existe lista de CPF legível. Duplicata de hash é duplicata de CPF, que é
    tudo que a contagem precisa;
  - imprime SOMENTE números.

Credenciais: lidas de `.env.local` deste projeto. Nada é enviado a lugar nenhum
além do próprio SOC.

Uso:
    cd ~/Developer/"Projeto GP SafeWork"
    python3 scripts/medir-soc-carga.py                 # varredura completa
    python3 scripts/medir-soc-carga.py --sondar        # só os nomes dos campos
    python3 scripts/medir-soc-carga.py --limite 50     # amostra, para testar
"""
import argparse
import hashlib
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from collections import defaultdict

BASE = "https://ws1.soc.com.br/WebSoc/exportadados"
PAUSA = 0.3  # respeita o limite de requisições simultâneas do SOC


def carregar_env(caminho=".env.local"):
    env = {}
    try:
        for linha in open(caminho, encoding="utf-8"):
            linha = linha.strip()
            if linha and not linha.startswith("#") and "=" in linha:
                k, v = linha.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    except FileNotFoundError:
        sys.exit(f"não encontrei {caminho} — rode a partir da raiz do projeto GP SafeWork")
    return env


def chamar(env, mask, json_out=True, **extras):
    codigo, chave = mask.split(":")
    p = {"empresa": env.get("SOC_EMPRESA", "289501"), "codigo": codigo, "chave": chave}
    if json_out:
        p["tipoSaida"] = "json"
    p.update(extras)
    url = f"{BASE}?parametro={urllib.parse.quote(json.dumps(p))}"
    with urllib.request.urlopen(url, timeout=90) as r:
        bruto = r.read()
    # o SOC devolve ISO-8859-1 sem declarar charset
    texto = bruto.decode("utf-8", errors="replace")
    if "�" in texto:
        texto = bruto.decode("iso-8859-1")
    return texto


def empresas(env):
    """A máscara de empresas não aceita tipoSaida=json — devolve XML <record>."""
    xml = chamar(env, env["SOC_MASK_EMPRESAS"], json_out=False)
    out = []
    for rec in re.findall(r"<record>(.*?)</record>", xml, re.S):
        campos = dict(re.findall(r"<([A-Z_0-9]+)>(.*?)</\1>", rec, re.S))
        out.append({k: v.strip() for k, v in campos.items()})
    return out


def funcionarios(env, codigo_empresa):
    txt = chamar(env, env["SOC_MASK_FUNCIONARIOS"], empresaTrabalho=str(codigo_empresa))
    if not txt.strip().startswith(("[", "{")):
        raise RuntimeError(f"resposta inesperada: {txt[:120]}")
    d = json.loads(txt)
    return d if isinstance(d, list) else (list(d.values())[0] if d else [])


def campo(reg, *nomes):
    """Primeiro campo presente, tolerante a variação de nome."""
    for n in nomes:
        if n in reg and str(reg[n]).strip():
            return str(reg[n]).strip()
    return ""


def hash_cpf(cpf):
    d = re.sub(r"\D", "", cpf)
    return hashlib.sha256(d.encode()).hexdigest() if len(d) == 11 else ""


FAIXAS = [(1, 10), (11, 30), (31, 50), (51, 100), (101, 300), (301, 500), (501, 10**9)]


def rotulo_faixa(n):
    if n == 0:
        return "sem trabalhador"
    for a, b in FAIXAS:
        if a <= n <= b:
            return f"{a}–{b}" if b < 10**9 else "acima de 500"
    return "?"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sondar", action="store_true", help="só imprime os nomes dos campos")
    ap.add_argument("--limite", type=int, default=0, help="processa só N empresas (teste)")
    a = ap.parse_args()

    env = carregar_env()
    for obrigatoria in ("SOC_MASK_EMPRESAS", "SOC_MASK_FUNCIONARIOS"):
        if not env.get(obrigatoria):
            sys.exit(f"{obrigatoria} ausente no .env.local")

    print("buscando empresas…", flush=True)
    emp = empresas(env)
    print(f"  {len(emp)} empresas no cadastro")

    if a.sondar:
        print("\ncampos da EMPRESA:", sorted(emp[0].keys()) if emp else "vazio")
        alvo = next((e for e in emp if (e.get("NUMERO_VIDAS") or "0").isdigit()
                     and int(e.get("NUMERO_VIDAS") or 0) > 0), None)
        if alvo:
            f = funcionarios(env, alvo["CODIGO"])
            print(f"\nfuncionários de 1 empresa: {len(f)}")
            print("campos do FUNCIONÁRIO:", sorted(f[0].keys()) if f else "vazio")
        return

    com_vidas = [e for e in emp if (e.get("NUMERO_VIDAS") or "0").isdigit()
                 and int(e.get("NUMERO_VIDAS") or 0) > 0]
    if a.limite:
        com_vidas = com_vidas[: a.limite]
    print(f"  {len(com_vidas)} com vidas > 0 — varrendo\n", flush=True)

    # ---- acumuladores (só contadores; nenhuma linha nominal) ------------------
    total = ativos = sem_cpf = sem_cpf_ativos = sem_cpf_com_mat = sem_cpf_sem_mat = 0
    sem_cbo = 0
    empresas_com_ativo_sem_cpf = set()
    faixas_todos, faixas_ativos = defaultdict(int), defaultdict(int)
    por_cidade = defaultdict(int)
    tamanhos = []

    # repetidos: por empresa, hash de CPF → lista de (matrícula, ativo)
    rep_cpfs = rep_vinculos = 0
    rep_mat_distinta = rep_mat_igual = rep_mat_vazia = rep_sem_mat = 0
    rep_ativos = rep_inativos = 0

    falhas = 0
    t0 = time.time()
    for i, e in enumerate(com_vidas, 1):
        cidade = campo(e, "CIDADE", "MUNICIPIO", "NOMECIDADE")
        por_cidade[cidade or "(sem cidade)"] += 1
        try:
            regs = funcionarios(env, e["CODIGO"])
        except Exception:
            falhas += 1
            time.sleep(PAUSA)
            continue

        n_emp = n_emp_ativos = 0
        porcpf = defaultdict(list)
        for r in regs:
            n_emp += 1
            total += 1
            situacao = campo(r, "SITUACAO", "SITUACAOFUNCIONARIO").upper()
            eh_ativo = situacao.startswith("ATIV")
            if eh_ativo:
                ativos += 1
                n_emp_ativos += 1

            cpf = campo(r, "CPFFUNCIONARIO", "CPF")
            mat = campo(r, "MATRICULAFUNCIONARIO", "MATRICULA", "MATRICULARH", "CODIGO_RH")
            if not campo(r, "CBOCARGO", "CBO"):
                sem_cbo += 1

            h = hash_cpf(cpf)
            if not h:
                sem_cpf += 1
                if eh_ativo:
                    sem_cpf_ativos += 1
                    empresas_com_ativo_sem_cpf.add(e["CODIGO"])
                    if mat:
                        sem_cpf_com_mat += 1
                    else:
                        sem_cpf_sem_mat += 1
            else:
                porcpf[h].append((mat, eh_ativo))

        for h, vinculos in porcpf.items():
            if len(vinculos) < 2:
                continue
            rep_cpfs += 1
            rep_vinculos += len(vinculos)
            mats = [m for m, _ in vinculos]
            rep_ativos += sum(1 for _, at in vinculos if at)
            rep_inativos += sum(1 for _, at in vinculos if not at)
            if all(m == "" for m in mats):
                rep_sem_mat += len(vinculos)
            elif any(m == "" for m in mats):
                rep_mat_vazia += len(vinculos)
            elif len(set(mats)) == len(mats):
                rep_mat_distinta += len(vinculos)
            else:
                rep_mat_igual += len(vinculos)

        tamanhos.append(n_emp)
        faixas_todos[rotulo_faixa(n_emp)] += 1
        faixas_ativos[rotulo_faixa(n_emp_ativos)] += 1

        if i % 100 == 0:
            print(f"  {i}/{len(com_vidas)} empresas · {total} trabalhadores · "
                  f"{(time.time()-t0)/60:.1f} min", flush=True)
        time.sleep(PAUSA)

    # ---- saída: SÓ NÚMEROS ---------------------------------------------------
    print("\n" + "=" * 60)
    print("  MEDIÇÕES AGREGADAS — SOC")
    print("=" * 60)
    print(f"\nempresas varridas: {len(com_vidas)}   falhas de leitura: {falhas}")
    print(f"tempo: {(time.time()-t0)/60:.1f} min")

    print("\n--- MEDIÇÃO 1 — CPF repetido na mesma empresa ---")
    print(f"1.1 CPFs distintos repetidos ........... {rep_cpfs}")
    print(f"1.2 vínculos envolvidos ................ {rep_vinculos}")
    print(f"1.3 com matrícula DISTINTA ............. {rep_mat_distinta}")
    print(f"1.4 com matrícula IGUAL ................ {rep_mat_igual}")
    print(f"1.6 com matrícula vazia em algum ....... {rep_mat_vazia}")
    print(f"1.7 sem matrícula em nenhum ............ {rep_sem_mat}")
    print(f"1.8 vínculos repetidos ATIVOS .......... {rep_ativos}")
    print(f"1.9 vínculos repetidos INATIVOS ........ {rep_inativos}")
    if rep_vinculos:
        print(f"    → matrícula distinta = {rep_mat_distinta/rep_vinculos*100:.1f}% dos repetidos")

    print("\n--- MEDIÇÃO 2 — sem CPF ---")
    print(f"2.1 trabalhadores ativos ............... {ativos}")
    print(f"2.2 ativos SEM CPF ..................... {sem_cpf_ativos}")
    print(f"2.3 ativos sem CPF COM matrícula ....... {sem_cpf_com_mat}")
    print(f"2.4 ativos sem CPF SEM matrícula ....... {sem_cpf_sem_mat}")
    print(f"2.5 empresas com ao menos 1 assim ...... {len(empresas_com_ativo_sem_cpf)}")
    print(f"    (base inteira sem CPF: {sem_cpf})")

    print("\n--- MEDIÇÃO 3 — faixas de tamanho ---")
    ordem = ["sem trabalhador", "1–10", "11–30", "31–50", "51–100", "101–300", "301–500", "acima de 500"]
    print(f"{'faixa':<18} {'todos':>8} {'ativos':>8}")
    for f in ordem:
        if faixas_todos.get(f) or faixas_ativos.get(f):
            print(f"{f:<18} {faixas_todos.get(f,0):>8} {faixas_ativos.get(f,0):>8}")
    if tamanhos:
        tamanhos.sort()
        print(f"\n3.1 maior empresa ...................... {tamanhos[-1]}")
        print(f"3.2 dez maiores ........................ {tamanhos[-10:][::-1]}")
        print(f"3.3 mediana ............................ {tamanhos[len(tamanhos)//2]}")

    print("\n--- MEDIÇÃO 4 — cidades (as 15 maiores) ---")
    top = sorted(por_cidade.items(), key=lambda x: -x[1])[:15]
    for cidade, n in top:
        print(f"  {cidade:<32} {n:>6}")
    resto = sum(n for _, n in sorted(por_cidade.items(), key=lambda x: -x[1])[15:])
    print(f"  {'(outras)':<32} {resto:>6}")
    print(f"\n  cidades distintas: {len(por_cidade)}")

    print("\n--- outros ---")
    print(f"total de trabalhadores lidos ........... {total}")
    print(f"sem CBO ................................ {sem_cbo}")
    print("=" * 60)


if __name__ == "__main__":
    main()
