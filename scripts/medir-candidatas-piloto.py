#!/usr/bin/env python3
"""
Mede as candidatas ao piloto C da carga SOC.

A faixa vem da decisão 1.25-N: 10 a 30 ativos. Este script mede, para cada
candidata, o que os critérios de aceite pedem — estrutura simples, poucas
exceções — e devolve um ranking.

O que NÃO faz: escolher. A escolha depende da emissora, que o SOC não tem e só
a SafeWork sabe. O script entrega a lista curta; a validação é humana.

CONTAR NÃO É EXTRAIR. Só números e o código da empresa. Nenhum nome de cliente,
CPF, trabalhador ou lista nominal sai daqui — o CPF é hasheado antes de entrar
no detector de duplicata.

Uso:
    cd ~/Developer/"Projeto GP SafeWork"
    python3 scripts/medir-candidatas-piloto.py
    python3 scripts/medir-candidatas-piloto.py --min 10 --max 30 --top 15
"""
import argparse
import csv
import hashlib
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from collections import defaultdict

BASE = "https://ws1.soc.com.br/WebSoc/exportadados"
PAUSA = 0.3
DE_PARA = os.path.expanduser("~/Documents/de-para-emissora-soc.csv")


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


def funcionarios(env, codigo):
    cod, chave = env["SOC_MASK_FUNCIONARIOS"].split(":")
    p = {
        "empresa": env.get("SOC_EMPRESA", "289501"),
        "codigo": cod,
        "chave": chave,
        "tipoSaida": "json",
        "empresaTrabalho": str(codigo),
    }
    url = f"{BASE}?parametro={urllib.parse.quote(json.dumps(p))}"
    with urllib.request.urlopen(url, timeout=90) as r:
        bruto = r.read()
    txt = bruto.decode("utf-8", errors="replace")
    if "�" in txt:
        txt = bruto.decode("iso-8859-1")
    if not txt.strip().startswith(("[", "{")):
        raise RuntimeError("resposta inesperada")
    d = json.loads(txt)
    return d if isinstance(d, list) else (list(d.values())[0] if d else [])


def campo(r, *nomes):
    for n in nomes:
        if n in r and str(r[n]).strip():
            return str(r[n]).strip()
    return ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--min", type=int, default=10)
    ap.add_argument("--max", type=int, default=30)
    ap.add_argument("--top", type=int, default=15)
    a = ap.parse_args()

    if not os.path.exists(DE_PARA):
        sys.exit(f"não achei {DE_PARA} — rode gerar-de-para-emissora.py antes")

    candidatas = []
    for l in csv.DictReader(open(DE_PARA, encoding="utf-8"), delimiter=";"):
        if l["status"] != "pendente":
            continue
        try:
            ativos = int(l["ativos"])
        except ValueError:
            continue
        if a.min <= ativos <= a.max:
            candidatas.append({"codigo": l["codigo_soc"], "ativos": ativos,
                               "total": int(l["trabalhadores"] or 0)})

    print(f"{len(candidatas)} empresas na faixa {a.min}–{a.max} ativos — medindo\n", flush=True)

    env = carregar_env()
    medidas = []
    t0 = time.time()
    for i, c in enumerate(candidatas, 1):
        try:
            regs = funcionarios(env, c["codigo"])
        except Exception:
            time.sleep(PAUSA)
            continue

        unidades, setores, funcoes = set(), set(), set()
        sem_cpf = sem_cbo = 0
        porcpf = defaultdict(int)
        for r in regs:
            ativo = campo(r, "SITUACAO").upper().startswith("ATIV")
            if not ativo:
                continue
            if campo(r, "NOMEUNIDADE", "CODIGOUNIDADE"):
                unidades.add(campo(r, "NOMEUNIDADE", "CODIGOUNIDADE"))
            if campo(r, "NOMESETOR", "CODIGOSETOR"):
                setores.add(campo(r, "NOMESETOR", "CODIGOSETOR"))
            if campo(r, "NOMECARGO", "CODIGOCARGO"):
                funcoes.add(campo(r, "NOMECARGO", "CODIGOCARGO"))
            if not campo(r, "CBOCARGO"):
                sem_cbo += 1
            d = re.sub(r"\D", "", campo(r, "CPFFUNCIONARIO"))
            if len(d) != 11:
                sem_cpf += 1
            else:
                porcpf[hashlib.sha256(d.encode()).hexdigest()] += 1

        repetidos = sum(1 for n in porcpf.values() if n > 1)
        # nota: menor é melhor. Estrutura enxuta e zero exceção são o ideal.
        nota = sem_cpf * 10 + repetidos * 10 + len(setores) + len(funcoes)
        medidas.append({**c, "unidades": len(unidades), "setores": len(setores),
                        "funcoes": len(funcoes), "sem_cpf": sem_cpf,
                        "sem_cbo": sem_cbo, "repetidos": repetidos, "nota": nota})

        if i % 50 == 0:
            print(f"  {i}/{len(candidatas)} · {(time.time()-t0)/60:.1f} min", flush=True)
        time.sleep(PAUSA)

    medidas.sort(key=lambda m: (m["nota"], m["setores"] + m["funcoes"]))

    print("\n" + "=" * 78)
    print(f"  CANDIDATAS AO PILOTO C — as {a.top} melhores de {len(medidas)} medidas")
    print("=" * 78)
    print(f"\n{'código':>10} {'ativos':>7} {'total':>7} {'un':>4} {'set':>5} {'fun':>5} "
          f"{'s/CPF':>6} {'s/CBO':>6} {'rep':>4}")
    for m in medidas[: a.top]:
        print(f"{m['codigo']:>10} {m['ativos']:>7} {m['total']:>7} {m['unidades']:>4} "
              f"{m['setores']:>5} {m['funcoes']:>5} {m['sem_cpf']:>6} {m['sem_cbo']:>6} "
              f"{m['repetidos']:>4}")

    limpas = [m for m in medidas if m["sem_cpf"] == 0 and m["repetidos"] == 0]
    print(f"\n  sem NENHUMA exceção (0 sem-CPF e 0 repetido): {len(limpas)} de {len(medidas)}")
    if limpas:
        e = limpas[0]
        print(f"  estrutura mais enxuta entre elas: código {e['codigo']} — "
              f"{e['ativos']} ativos, {e['unidades']} unidade(s), {e['setores']} setor(es), "
              f"{e['funcoes']} função(ões)")
    print(f"\n  tempo: {(time.time()-t0)/60:.1f} min")
    print("\n  A ESCOLHA depende da EMISSORA, que o SOC não tem. Validação é humana.")
    print("=" * 78)

    saida = os.path.expanduser("~/Documents/candidatas-piloto-c.csv")
    with open(saida, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(medidas[0].keys()), delimiter=";")
        w.writeheader()
        w.writerows(medidas)
    print(f"\n  detalhe completo em: {saida}")


if __name__ == "__main__":
    main()
