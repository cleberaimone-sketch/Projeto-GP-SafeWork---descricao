'use client'

// Clínicas parceiras: o que pagamos e o que atendemos, lado a lado.
//
// Os dois lados existem e NÃO são cruzáveis automaticamente. No Conta Azul a
// clínica é "ENGMED SAUDE E SEGURANCA DO TRABALHO"; no SOC, "P -
// (Credenciamento)ENGMED". Casar por semelhança erra feio — "CLINICA" é palavra
// comum, e a heurística que testei ligou "CLINICA VIP LTDA" a "CLINICA MELO".
// Atribuir o custo de uma clínica a outra é pior do que não atribuir.
//
// Então ficam em duas colunas, para ler junto. O cruzamento automático espera o
// ERP novo, que vai identificar o prestador em cada lançamento.

const brl = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)
const num = (v: number) => v.toLocaleString('pt-BR')

export type DadosClinicas = {
  ano: number
  cobertura: { lancamentos: number; com_nome: number; valor_total: number; valor_com_nome: number }
  pago: { nome: string; lancamentos: number; valor: number; de: string; ate: string }[]
  atendido: { nome: string; consultas: number; exames: number; empresas: number }[]
}

/** Tira o prefixo do SOC: "P - (Credenciamento)ENGMED" vira "ENGMED". */
function semPrefixo(nome: string) {
  return nome.replace(/^(P\s*-?\s*\(?[Cc]redenciamento\)?\s*|SOCNET\s*-\s*)/, '').trim()
}

export default function ClinicasParceiras({ dados }: { dados: DadosClinicas }) {
  const { cobertura, pago, atendido } = dados
  if (pago.length === 0 && atendido.length === 0) return null

  const pctValor = cobertura.valor_total > 0
    ? (cobertura.valor_com_nome / cobertura.valor_total) * 100 : 0
  const totalConsultas = atendido.reduce((s, a) => s + a.consultas, 0)

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h2 className="font-bold text-slate-800 mb-1">Rede credenciada — {dados.ano}</h2>
      <p className="text-[11px] text-slate-500 mb-4">
        À esquerda, quanto foi pago a cada clínica (Conta Azul). À direita, quanto cada prestador
        atendeu (SOC). <strong>As duas listas não se cruzam automaticamente</strong>: a mesma
        clínica tem nomes diferentes nos dois sistemas, e casar por semelhança erraria — precisa
        ser lido junto.
      </p>

      {pctValor < 95 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 mb-4">
          <p className="text-[11px] text-amber-900">
            <strong>A coluna da esquerda está incompleta.</strong> O nome do prestador só passou a
            ser gravado em 11/09/2026, e o sync refaz apenas a janela recente — são{' '}
            {brl(cobertura.valor_com_nome)} de {brl(cobertura.valor_total)} ({pctValor.toFixed(0)}%),
            a partir de junho. Uma recarga histórica do Conta Azul completa o resto.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <div className="flex items-baseline justify-between mb-2 pb-1.5 border-b border-slate-200">
            <p className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
              Pago por clínica
            </p>
            <p className="text-[10px] text-slate-400">{pago.length} identificadas</p>
          </div>
          <div className="space-y-0.5 max-h-[420px] overflow-y-auto">
            {pago.map(c => (
              <div key={c.nome} className="flex items-baseline gap-2 py-1 border-b border-slate-50 text-[11px]">
                <span className="text-slate-700 truncate flex-1" title={c.nome}>{c.nome}</span>
                <span className="text-slate-400 shrink-0">{c.lancamentos}×</span>
                <span className="font-medium text-slate-800 tabular-nums shrink-0 w-[76px] text-right">
                  {brl(c.valor)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-baseline justify-between mb-2 pb-1.5 border-b border-slate-200">
            <p className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
              Atendimento por prestador
            </p>
            <p className="text-[10px] text-slate-400">{num(totalConsultas)} consultas</p>
          </div>
          <div className="space-y-0.5 max-h-[420px] overflow-y-auto">
            {atendido.map(a => (
              <div key={a.nome} className="flex items-baseline gap-2 py-1 border-b border-slate-50 text-[11px]">
                <span className="text-slate-700 truncate flex-1" title={a.nome}>{semPrefixo(a.nome)}</span>
                <span className="text-slate-400 shrink-0" title="empresas atendidas">
                  {a.empresas} emp.
                </span>
                <span className="font-medium text-slate-800 tabular-nums shrink-0 w-[58px] text-right">
                  {num(a.consultas)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="text-[10px] text-slate-400 mt-3">
        Para saber a margem de uma clínica, ache-a nas duas colunas: o valor pago de um lado, as
        consultas do outro. Enquanto o nome do prestador não vier igual nos dois sistemas, essa
        conta não pode ser feita sozinha sem risco de trocar uma clínica por outra.
      </p>
    </div>
  )
}
