#!/usr/bin/env python3
"""
Complemento da medição 1: CPF repetido considerando SÓ OS ATIVOS.

Por que existe: a medição 1 contou 11.062 vínculos em grupos de CPF repetido, e
1.517 deles são de trabalhadores ativos. Mas isso NÃO responde a pergunta que
decide a carga.

Um CPF com 1 vínculo ativo e 3 inativos contribui 1 para "repetidos ativos" —
e, ao carregar só ativos, deixa de ser repetido. O que quebra a etapa C é o CPF
com DOIS OU MAIS vínculos ATIVOS na mesma empresa, porque aí a repetição
sobrevive ao filtro.

Se esse número for perto de zero, carregar só ativos elimina o bloqueio 2 por
completo — sem precisar mexer na chave de dedup.

Mesma disciplina: contadores em memória, CPF em SHA-256, só números na saída.

Uso:
    cd ~/Developer/"Projeto GP SafeWork"
    python3 scripts/medir-soc-repetidos-ativos.py
"""
import hashlib
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from collections import defaultdict

BASE = "https://ws1.soc.com.br/WebSoc/exportadados"
PAUSA = 0.3


def carregar_env(caminho=".env.local"):
    env = {}
    try:
        for linha in open(caminho, encoding="utf-8"):
            linha = linha.strip()
            if linha and not linha.startswith("#") and "=" in linha:
                k, v = linha.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    except FileNotFoundError:
        sys.exit(f"não encontrei {caminho} — rode da raiz do projeto GP SafeWork")
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
    texto = bruto.decode("utf-8", errors="replace")
    if "�" in texto:
        texto = bruto.decode("iso-8859-1")
    return texto


def campo(reg, *nomes):
    for n in nomes:
        if n in reg and str(reg[n]).strip():
            return str(reg[n]).strip()
    return ""


def main():
    env = carregar_env()
    xml = chamar(env, env["SOC_MASK_EMPRESAS"], json_out=False)
    empresas = []
    for rec in re.findall(r"<record>(.*?)</record>", xml, re.S):
        campos = dict(re.findall(r"<([A-Z_0-9]+)>(.*?)</\1>", rec, re.S))
        campos = {k: v.strip() for k, v in campos.items()}
        vidas = campos.get("NUMERO_VIDAS") or "0"
        if vidas.isdigit() and int(vidas) > 0:
            empresas.append(campos)

    print(f"{len(empresas)} empresas com vidas > 0 — varrendo\n", flush=True)

    # entre ATIVOS
    cpfs_2mais_ativos = 0          # CPFs com >= 2 vínculos ativos na mesma empresa
    vinculos_2mais_ativos = 0
    mat_distinta = mat_igual = mat_vazia = sem_mat = 0
    empresas_afetadas = set()

    # controle
    total_ativos = 0
    falhas = 0
    t0 = time.time()

    for i, e in enumerate(empresas, 1):
        try:
            txt = chamar(env, env["SOC_MASK_FUNCIONARIOS"], empresaTrabalho=str(e["CODIGO"]))
            regs = json.loads(txt) if txt.strip().startswith(("[", "{")) else []
            if isinstance(regs, dict):
                regs = list(regs.values())[0] if regs else []
        except Exception:
            falhas += 1
            time.sleep(PAUSA)
            continue

        porcpf = defaultdict(list)
        for r in regs:
            if not campo(r, "SITUACAO", "SITUACAOFUNCIONARIO").upper().startswith("ATIV"):
                continue
            total_ativos += 1
            d = re.sub(r"\D", "", campo(r, "CPFFUNCIONARIO", "CPF"))
            if len(d) != 11:
                continue
            h = hashlib.sha256(d.encode()).hexdigest()
            porcpf[h].append(campo(r, "MATRICULAFUNCIONARIO", "MATRICULA", "MATRICULARH"))

        for h, mats in porcpf.items():
            if len(mats) < 2:
                continue
            cpfs_2mais_ativos += 1
            vinculos_2mais_ativos += len(mats)
            empresas_afetadas.add(e["CODIGO"])
            if all(m == "" for m in mats):
                sem_mat += len(mats)
            elif any(m == "" for m in mats):
                mat_vazia += len(mats)
            elif len(set(mats)) == len(mats):
                mat_distinta += len(mats)
            else:
                mat_igual += len(mats)

        if i % 200 == 0:
            print(f"  {i}/{len(empresas)} · {total_ativos} ativos · "
                  f"{(time.time()-t0)/60:.1f} min", flush=True)
        time.sleep(PAUSA)

    print("\n" + "=" * 60)
    print("  CPF REPETIDO ENTRE ATIVOS — o que sobrevive ao filtro")
    print("=" * 60)
    print(f"\nempresas varridas: {len(empresas)}   falhas: {falhas}")
    print(f"ativos lidos: {total_ativos}")
    print(f"tempo: {(time.time()-t0)/60:.1f} min")
    print(f"\nCPFs com 2+ vínculos ATIVOS na mesma empresa .... {cpfs_2mais_ativos}")
    print(f"vínculos envolvidos ............................. {vinculos_2mais_ativos}")
    print(f"empresas afetadas ............................... {len(empresas_afetadas)}")
    if vinculos_2mais_ativos:
        print(f"\n  desses vínculos:")
        print(f"    matrícula DISTINTA .......................... {mat_distinta}")
        print(f"    matrícula IGUAL ............................. {mat_igual}")
        print(f"    matrícula vazia em algum .................... {mat_vazia}")
        print(f"    sem matrícula em nenhum ..................... {sem_mat}")
    if total_ativos:
        print(f"\n  = {vinculos_2mais_ativos/total_ativos*100:.2f}% dos ativos")
    print("=" * 60)


if __name__ == "__main__":
    main()
