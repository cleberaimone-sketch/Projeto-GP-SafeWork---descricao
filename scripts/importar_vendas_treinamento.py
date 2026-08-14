#!/usr/bin/env python3
"""
Importa o relatório de vendas de treinamento da SafeT para o Supabase.

Uso:
    python3 scripts/importar_vendas_treinamento.py <caminho-do-csv>

O CSV é a exportação "vendas-safet-todos" do comercial: separador ';',
UTF-8 com BOM, valores no formato brasileiro (1.234,56).

Reimportar o mesmo arquivo não duplica: cada venda gera um hash estável a
partir de data + cliente + descrição + valor, e o insert é um upsert por esse
hash. Assim dá para rodar de novo quando o comercial mandar a planilha
atualizada, que só as linhas novas entram.
"""
from __future__ import annotations  # anotações adiadas: roda em Python < 3.10

import csv
import hashlib
import io
import json
import os
import re
import sys
import urllib.request

EMPRESA_SAFET = '3765298d-80f7-4bb3-8b77-2da17b064083'
LOTE = 100

# Temas que não têm número de NR mas são produto vendido — aparecem no texto
# livre da negociação e valem tanto quanto uma NR para medir produção.
TEMAS = [
    ('PRIMEIROS SOCORROS', 'Primeiros Socorros'),
    ('BRIGADA', 'Brigada de Incêndio'),
    ('CIPA', 'CIPA'),
    ('SIPAT', 'SIPAT'),
    ('ERGONOMIA', 'Ergonomia'),
    ('SALVAMENTO', 'Salvamento'),
    ('DIRECAO DEFENSIVA', 'Direção Defensiva'),
    ('DIREÇÃO DEFENSIVA', 'Direção Defensiva'),
    ('SIMULADO', 'Simulado'),
    ('PALESTRA', 'Palestra'),
]


def extrair_nrs(texto: str) -> list[str]:
    """NR5, NR-05 e NR 5 viram todos 'NR-05'."""
    up = texto.upper()
    achadas = set()
    for m in re.finditer(r'NR\s*-?\s*(\d{1,2})', up):
        achadas.add(f'NR-{int(m.group(1)):02d}')
    for chave, rotulo in TEMAS:
        if chave in up:
            achadas.add(rotulo)
    return sorted(achadas)


def modalidade(texto: str) -> str:
    up = texto.upper()
    return 'EAD / Online' if ('EAD' in up or 'ONLINE' in up) else 'Presencial'


def valor_br(s: str) -> float:
    s = (s or '').strip()
    if not s:
        return 0.0
    return float(s.replace('.', '').replace(',', '.'))


def data_iso(s: str) -> str:
    d, m, a = s.strip().split('/')
    return f'{a}-{m.zfill(2)}-{d.zfill(2)}'


def limpar(s: str | None) -> str | None:
    if s is None:
        return None
    s = s.strip()
    # O export usa "—" e "Nao informada" como vazio.
    return None if s in ('', '—', '-', 'Nao informada', 'Não informada') else s


def montar(reg: dict) -> dict | None:
    if not reg.get('Data') or not reg.get('Cliente'):
        return None
    data = data_iso(reg['Data'])
    cliente = ' '.join(reg['Cliente'].split())
    descricao = ' '.join((reg.get('Negociação') or '').split())
    valor = valor_br(reg.get('Valor', '0'))
    chave = f'{data}|{cliente}|{descricao}|{valor:.2f}'
    return {
        'empresa_id': EMPRESA_SAFET,
        'data_venda': data,
        'cliente': cliente,
        'cnpj': limpar(reg.get('CNPJ')),
        'descricao': descricao or None,
        'valor': valor,
        'vendedor': limpar(reg.get('Vendedor')),
        'unidade': limpar(reg.get('Unidade')),
        'tipo_contrato': limpar(reg.get('Tipo de contrato')),
        'forma_pagamento': limpar(reg.get('Forma de pagamento')),
        'cortesia': (reg.get('Cortesia') or '').strip().lower().startswith('s'),
        'nrs': extrair_nrs(descricao),
        'modalidade': modalidade(descricao),
        'hash_dedup': hashlib.sha1(chave.encode('utf-8')).hexdigest(),
    }


def enviar(linhas: list[dict], url: str, chave: str) -> None:
    corpo = json.dumps(linhas, ensure_ascii=False).encode('utf-8')
    req = urllib.request.Request(
        f'{url}/rest/v1/vendas_treinamento?on_conflict=hash_dedup',
        data=corpo,
        method='POST',
        headers={
            'apikey': chave,
            'Authorization': f'Bearer {chave}',
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates,return=minimal',
        },
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        if resp.status >= 300:
            raise SystemExit(f'falhou: HTTP {resp.status}')


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)

    url = os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
    chave = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
    if not url or not chave:
        raise SystemExit(
            'defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY '
            '(estão em web/.env.local)'
        )

    texto = open(sys.argv[1], encoding='utf-8-sig').read()
    regs = list(csv.DictReader(io.StringIO(texto), delimiter=';'))
    linhas = [x for x in (montar(r) for r in regs) if x]

    print(f'{len(linhas)} vendas lidas de {len(regs)} linhas')
    for i in range(0, len(linhas), LOTE):
        lote = linhas[i:i + LOTE]
        enviar(lote, url.rstrip('/'), chave)
        print(f'  enviadas {i + len(lote)}/{len(linhas)}')
    print('concluído')


if __name__ == '__main__':
    main()
