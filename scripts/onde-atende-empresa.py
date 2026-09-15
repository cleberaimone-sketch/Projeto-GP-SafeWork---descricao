#!/usr/bin/env python3
"""
Descobre em QUAL UNIDADE SafeWork os exames de uma empresa foram realizados.

Para que serve: o SOC não tem campo de emissora, e a cidade do CNPJ é rascunho
— matriz em Foz não significa atendimento por Foz. Mas onde os exames foram
FEITOS é evidência de atendimento, e isso o SOC registra.

⚠️ A máscara de exames traz DADO CLÍNICO. Este script:
  - lê os registros só o tempo de incrementar um contador por unidade;
  - NUNCA grava linha, nome, CPF ou nome de exame;
  - imprime apenas: unidade → quantidade.

Nada além da contagem por unidade sai daqui.

Uso:
    cd ~/Developer/"Projeto GP SafeWork"
    python3 scripts/onde-atende-empresa.py --empresa 2121439 --meses 24
"""
import argparse
import json
import sys
import time
import urllib.parse
import urllib.request
from collections import Counter
from datetime import date, timedelta

BASE = "https://ws1.soc.com.br/WebSoc/exportadados"


def carregar_env(caminho=".env.local"):
    env = {}
    try:
        for linha in open(caminho, encoding="utf-8"):
            linha = linha.strip()
            if linha and not linha.startswith("#") and "=" in linha:
                k, v = linha.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    except FileNotFoundError:
        sys.exit(f"não encontrei {caminho}")
    return env


def ddmmyyyy(d: date) -> str:
    return f"{d.day:02d}/{d.month:02d}/{d.year}"


def exames(env, empresa, ini, fim):
    """A máscara de exames exige janela <= 30 dias, em DD/MM/YYYY."""
    cod, chave = env["SOC_MASK_ASO"].split(":")
    p = {
        "empresa": env.get("SOC_EMPRESA", "289501"),
        "codigo": cod,
        "chave": chave,
        "tipoSaida": "json",
        "empresaTrabalho": str(empresa),
        "dataInicio": ddmmyyyy(ini),
        "dataFim": ddmmyyyy(fim),
    }
    url = f"{BASE}?parametro={urllib.parse.quote(json.dumps(p))}"
    with urllib.request.urlopen(url, timeout=90) as r:
        bruto = r.read()
    txt = bruto.decode("utf-8", errors="replace")
    if "�" in txt:
        txt = bruto.decode("iso-8859-1")
    if not txt.strip().startswith(("[", "{")):
        return []
    d = json.loads(txt)
    return d if isinstance(d, list) else (list(d.values())[0] if d else [])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--empresa", required=True)
    ap.add_argument("--meses", type=int, default=24)
    ap.add_argument("--campos", action="store_true", help="só lista os nomes dos campos")
    a = ap.parse_args()

    env = carregar_env()
    hoje = date.today()
    por_unidade = Counter()
    total = 0
    janelas = 0

    # janelas de 30 dias para trás
    fim = hoje
    while janelas < a.meses:
        ini = fim - timedelta(days=29)
        try:
            regs = exames(env, a.empresa, ini, fim)
        except Exception:
            regs = []

        if a.campos and regs:
            print("campos disponíveis:", sorted(regs[0].keys()))
            return

        for r in regs:
            total += 1
            # SÓ a unidade interessa. Nada mais é lido.
            u = ""
            for chave in ("UNIDADE", "NOMEUNIDADE", "UNIDADEATENDIMENTO", "PRESTADOR", "NOMEPRESTADOR"):
                if chave in r and str(r[chave]).strip():
                    u = str(r[chave]).strip()
                    break
            por_unidade[u or "(sem unidade informada)"] += 1

        fim = ini - timedelta(days=1)
        janelas += 1
        time.sleep(0.3)

    print("=" * 62)
    print(f"  ONDE OS EXAMES DA EMPRESA {a.empresa} FORAM REALIZADOS")
    print(f"  janela: últimos {a.meses} meses · {total} registro(s)")
    print("=" * 62)
    if not por_unidade:
        print("\n  nenhum exame no período — a evidência não existe por aqui")
    for u, n in por_unidade.most_common():
        pct = n / total * 100 if total else 0
        print(f"  {u:<44} {n:>5}  ({pct:.0f}%)")
    print("\n  Contagem por unidade. Nenhuma linha, nome, CPF ou exame foi gravado.")
    print("=" * 62)


if __name__ == "__main__":
    main()
