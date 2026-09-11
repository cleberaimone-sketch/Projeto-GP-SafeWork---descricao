#!/usr/bin/env python3
"""
Gera o CSV do de-para empresa → unidade SafeWork, já preenchido com o que a API
do SOC entrega — e ordenado pelo que realmente importa.

O de-para é o bloqueio 1 da carga: o SOC não tem campo de emissora, e sem ele a
etapa A ignora todas as empresas. Preencher 3.509 linhas em branco é trabalho de
dias; preencher UMA COLUNA num arquivo já ordenado é trabalho de horas.

⚠️ NÃO ordena por NUMERO_VIDAS. Medido em 11/09: os maiores valores são 207.501,
84.005 e 49.130, enquanto a maior empresa tem 7.336 trabalhadores de verdade. É
métrica acumulada do SOC — histórico, não gente hoje. Ordenar por ela colocaria
as empresas erradas no topo da fila, que é o pior lugar para um erro de ordem.

Por isso o script VARRE empresa a empresa e conta trabalhadores e ativos. Custa
~35 min e produz um arquivo ordenado por ATIVOS, que é o que decide o piloto.

O ARQUIVO NÃO VAI PARA O REPOSITÓRIO. Razão social e carteira de clientes são
informação comercial da SafeWork. Grava em ~/Documents por padrão, no mesmo
lugar do arquivo de senhas do piloto.

Uso:
    cd ~/Developer/"Projeto GP SafeWork"
    python3 scripts/gerar-de-para-emissora.py
    python3 scripts/gerar-de-para-emissora.py --limite 100   # teste
"""
import argparse
import csv
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

BASE = "https://ws1.soc.com.br/WebSoc/exportadados"
PAUSA = 0.3

UNIDADES = [
    "Safe+ (Nacional)",
    "SafeWork Foz do Iguaçu",
    "SafeWork Londrina",
    "SafeWork Medianeira",
    "SafeWork Santa Helena",
]


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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--saida", default=os.path.expanduser("~/Documents/de-para-emissora-soc.csv"))
    ap.add_argument("--limite", type=int, default=0)
    a = ap.parse_args()

    env = carregar_env()
    xml = chamar(env, env["SOC_MASK_EMPRESAS"], json_out=False)
    empresas = []
    for rec in re.findall(r"<record>(.*?)</record>", xml, re.S):
        campos = dict(re.findall(r"<([A-Z_0-9]+)>(.*?)</\1>", rec, re.S))
        empresas.append({k: v.strip() for k, v in campos.items()})
    if a.limite:
        empresas = empresas[: a.limite]
    print(f"{len(empresas)} empresas — contando trabalhadores de cada uma\n", flush=True)

    linhas = []
    falhas = 0
    t0 = time.time()
    for i, e in enumerate(empresas, 1):
        total = ativos = 0
        try:
            txt = chamar(env, env["SOC_MASK_FUNCIONARIOS"], empresaTrabalho=str(e.get("CODIGO", "")))
            regs = json.loads(txt) if txt.strip().startswith(("[", "{")) else []
            if isinstance(regs, dict):
                regs = list(regs.values())[0] if regs else []
            total = len(regs)
            ativos = sum(
                1 for r in regs
                if str(r.get("SITUACAO", "")).strip().upper().startswith("ATIV")
            )
        except Exception:
            falhas += 1
            total = ativos = -1  # marca leitura falha, não zero
        linhas.append({
            "codigo_soc": e.get("CODIGO", ""),
            "razao_social": e.get("NOME", ""),
            "cnpj": e.get("CNPJ", ""),
            "trabalhadores": total,
            "ativos": ativos,
        })
        if i % 200 == 0:
            print(f"  {i}/{len(empresas)} · {(time.time()-t0)/60:.1f} min", flush=True)
        time.sleep(PAUSA)

    # ordena por ATIVOS: é o que decide o piloto, e o que a carga de ativos usa
    linhas.sort(key=lambda l: (l["ativos"], l["trabalhadores"]), reverse=True)

    com_ativos = sem_ativos = so_historico = com_falha = 0
    with open(a.saida, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow([
            "codigo_soc", "razao_social", "cnpj", "trabalhadores", "ativos",
            "unidade_safework", "criterio", "responsavel", "status", "observacao",
        ])
        for l in linhas:
            if l["ativos"] < 0:
                status, obs = "duvida", "falha ao ler o SOC — recontar antes de decidir"
                com_falha += 1
            elif l["ativos"] > 0:
                status, obs = "pendente", ""
                com_ativos += 1
            elif l["trabalhadores"] > 0:
                status, obs = "nao_importar", "só histórico, nenhum ativo"
                so_historico += 1
            else:
                status, obs = "nao_importar", "sem trabalhador no SOC"
                sem_ativos += 1
            w.writerow([
                l["codigo_soc"], l["razao_social"], l["cnpj"],
                l["trabalhadores"], l["ativos"],
                "", "", "", status, obs,
            ])

    print(f"\ngravado em: {a.saida}")
    print(f"  {com_ativos:>5} a classificar (têm ativos) — ordenadas por nº de ativos")
    print(f"  {so_historico:>5} marcadas nao_importar (só histórico)")
    print(f"  {sem_ativos:>5} marcadas nao_importar (sem trabalhador)")
    if com_falha:
        print(f"  {com_falha:>5} marcadas duvida (falha de leitura)")
    print(f"\ntempo: {(time.time()-t0)/60:.1f} min · falhas: {falhas}")
    print("\nPreencha SOMENTE `unidade_safework`, com um destes valores exatos:")
    for u in UNIDADES:
        print(f"    {u}")
    print("\n`criterio`: contrato | carteira | cidade_conferida | duvida")
    print("Em dúvida: unidade vazia e status=duvida.")
    print("\nO arquivo NÃO deve ir para o repositório.")


if __name__ == "__main__":
    main()
