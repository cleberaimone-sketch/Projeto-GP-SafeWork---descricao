// ============================================================
// RH — Quadro de pessoas, com custo individual mês a mês.
//
// Fonte: planilha "Dashboard de RH" (Google Sheets
// 1vjum9lVycAcvgtxBf9DSAbWhMu5mCxUL · abas C_F e C_S), extraída do arquivo em
// 11/09/2026. O DP abastece mensalmente — ver a memória planilha-rh-indicadores
// para o link e o fluxo de atualização.
//
// Esta é a planilha COMPLETA: tem quem saiu, motivo, data e custo por pessoa. A
// outra ("Indicadores RH - 2026", em dados.ts) traz o mesmo CTSE agregado, e as
// duas fecham — R$ 1.362.412 contra R$ 1.357.386 em jan-ago/2026, 0,4% de
// diferença. O headcount divergia (73 aqui, 66 lá em janeiro) porque cada uma
// conta de um jeito quem está de saída; Cleber vai alinhar o número na próxima
// atualização. Enquanto isso, headcount e custo saem DAQUI, para numerador e
// denominador virem da mesma fonte.
//
// São nomes de pessoas físicas. O arquivo é servido só a usuário autenticado,
// como o organograma que já existe em dados.ts.
// ============================================================

export interface Pessoa {
  nome: string
  /** PJ | CLT | Outros — o quadro migrou de CLT para PJ, ver custo-pessoal.ts */
  tipo: string
  cargo: string
  /** Vem de "Medicina - GP SafeWork": departamento e empresa no mesmo campo. */
  departamento: string
  empresa: string
  status: 'Ativo' | 'Inativo'
  admissao: string | null
  saida: string | null
  /** 12 posições (Jan-Dez). Zero = sem lançamento no mês, não salário zero. */
  custoMensal: number[]
}

export const PESSOAS: Pessoa[] = [
  {
    "nome": "Huender Eduardo Souza de Lima",
    "tipo": "PJ",
    "cargo": "",
    "departamento": "",
    "empresa": "",
    "status": "Ativo",
    "admissao": null,
    "saida": null,
    "custoMensal": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  },
  {
    "nome": "Luis Fernando Rabelo",
    "tipo": "PJ",
    "cargo": "Gerente",
    "departamento": "Comercial",
    "empresa": "GP SafeWork",
    "status": "Ativo",
    "admissao": "2015-02-12",
    "saida": null,
    "custoMensal": [7386.81, 8036.43, 8224.07, 7901.06, 7397.93, 7609.18, 15085.76, 12410.71, 0, 0, 0, 0]
  },
  {
    "nome": "Nathielli Rosa de Vargas",
    "tipo": "PJ",
    "cargo": "Supervisor(a)",
    "departamento": "Comercial",
    "empresa": "GP SafeWork",
    "status": "Ativo",
    "admissao": "2021-12-01",
    "saida": null,
    "custoMensal": [4111.5, 5100.06, 4259.89, 4648.62, 4098.14, 4494.0, 7417.07, 6718.46, 0, 0, 0, 0]
  },
  {
    "nome": "Douglas Jovelino De Andrade",
    "tipo": "PJ",
    "cargo": "Consultor Comercial",
    "departamento": "Comercial",
    "empresa": "GP SafeWork",
    "status": "Ativo",
    "admissao": "2025-07-07",
    "saida": null,
    "custoMensal": [3327.84, 3321.91, 3063.7, 3277.17, 3225.91, 3265.17, 3359.98, 3410.31, 0, 0, 0, 0]
  },
  {
    "nome": "Lucas Botelho",
    "tipo": "PJ",
    "cargo": "Consultor Comercial",
    "departamento": "Comercial",
    "empresa": "GP SafeWork",
    "status": "Ativo",
    "admissao": "2026-01-19",
    "saida": null,
    "custoMensal": [965.0, 2597.48, 2816.93, 2747.84, 2636.0, 2724.57, 2593.83, 2685.83, 0, 0, 0, 0]
  },
  {
    "nome": "Andrerssa da Silva",
    "tipo": "PJ",
    "cargo": "Auxiliar Administrativo",
    "departamento": "Comercial",
    "empresa": "GP SafeWork",
    "status": "Ativo",
    "admissao": "2026-05-27",
    "saida": null,
    "custoMensal": [0, 0, 0, 0, 135.0, 2000.0, 2000.0, 2000.0, 0, 0, 0, 0]
  },
  {
    "nome": "Janaina Flores Alexandre - GP SAFEWORK",
    "tipo": "PJ",
    "cargo": "Auxiliar Administrativo",
    "departamento": "Engenharia",
    "empresa": "GP SafeWork",
    "status": "Ativo",
    "admissao": null,
    "saida": null,
    "custoMensal": [0, 4000.0, 4000.0, 5500.0, 5500.0, 5850.0, 5500.0, 5100.0, 0, 0, 0, 0]
  },
  {
    "nome": "Carla Maria Lopes de Lima",
    "tipo": "PJ",
    "cargo": "Auxiliar Administrativo",
    "departamento": "Engenharia",
    "empresa": "GP SafeWork",
    "status": "Ativo",
    "admissao": "2025-02-24",
    "saida": null,
    "custoMensal": [2500.0, 2500.0, 2500.0, 3200.0, 3200.0, 3200.0, 3200.0, 3200.0, 0, 0, 0, 0]
  },
  {
    "nome": "Danielle Ines Engel Dahmer",
    "tipo": "PJ",
    "cargo": "Auxiliar Administrativo",
    "departamento": "Engenharia",
    "empresa": "GP SafeWork",
    "status": "Ativo",
    "admissao": "2026-02-24",
    "saida": null,
    "custoMensal": [0, 150.0, 3400.0, 2150.0, 0, 600.0, 2450.0, 2800.0, 0, 0, 0, 0]
  },
  {
    "nome": "Marcelo Ribeiro Cezar",
    "tipo": "Outros",
    "cargo": "Estagiário(a)",
    "departamento": "Engenharia",
    "empresa": "GP SafeWork",
    "status": "Ativo",
    "admissao": "2026-02-09",
    "saida": null,
    "custoMensal": [0, 777.69, 1054.83, 1054.83, 1054.83, 1054.83, 1054.83, 1054.83, 0, 0, 0, 0]
  },
  {
    "nome": "Evelyn Lavyne Woicziekoski Batista",
    "tipo": "PJ",
    "cargo": "Supervisor(a)",
    "departamento": "Financeiro",
    "empresa": "GP SafeWork",
    "status": "Ativo",
    "admissao": "2023-11-13",
    "saida": null,
    "custoMensal": [4250.0, 4250.0, 4250.0, 4250.0, 4250.0, 4250.0, 4750.0, 4750.0, 0, 0, 0, 0]
  },
  {
    "nome": "Gabriele das chagas Teles",
    "tipo": "PJ",
    "cargo": "Auxiliar Administrativo",
    "departamento": "Financeiro",
    "empresa": "GP SafeWork",
    "status": "Ativo",
    "admissao": "2025-08-27",
    "saida": null,
    "custoMensal": [2250.0, 2250.0, 2150.0, 2250.0, 2250.0, 2250.0, 2250.0, 2250.0, 0, 0, 0, 0]
  },
  {
    "nome": "Murilo Henrique Gonçalves",
    "tipo": "PJ",
    "cargo": "Auxiliar Administrativo",
    "departamento": "Financeiro",
    "empresa": "GP SafeWork",
    "status": "Ativo",
    "admissao": "2026-02-16",
    "saida": null,
    "custoMensal": [0, 1127.0, 2600.0, 2600.0, 2600.0, 2600.0, 3000.0, 3000.0, 0, 0, 0, 0]
  },
  {
    "nome": "Ricardo Santana de Almeida",
    "tipo": "PJ",
    "cargo": "Contador",
    "departamento": "Financeiro",
    "empresa": "GP SafeWork",
    "status": "Ativo",
    "admissao": "2024-04-22",
    "saida": null,
    "custoMensal": [3000.0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  },
  {
    "nome": "Josiane Klaus da Silva",
    "tipo": "PJ",
    "cargo": "Gerente",
    "departamento": "Geral",
    "empresa": "GP SafeWork",
    "status": "Ativo",
    "admissao": "2012-07-02",
    "saida": null,
    "custoMensal": [6053.0, 6053.0, 6053.0, 7500.0, 7500.0, 7500.0, 8000.0, 8000.0, 0, 0, 0, 0]
  },
  {
    "nome": "Larissa de Vargas Fernandes",
    "tipo": "PJ",
    "cargo": "Gerente",
    "departamento": "Medicina",
    "empresa": "GP SafeWork",
    "status": "Ativo",
    "admissao": "2016-02-01",
    "saida": null,
    "custoMensal": [7000.0, 7000.0, 7000.0, 7000.0, 8000.0, 8000.0, 8000.0, 8000.0, 0, 0, 0, 0]
  },
  {
    "nome": "Maria Jaciara da Silva Telles Rodrigues",
    "tipo": "CLT",
    "cargo": "Auxiliar Administrativo",
    "departamento": "PAC",
    "empresa": "GP SafeWork",
    "status": "Ativo",
    "admissao": "2022-02-23",
    "saida": null,
    "custoMensal": [3700.36, 3609.86, 3668.49, 3899.36, 4217.86, 4247.36, 4083.36, 3985.86, 0, 0, 0, 0]
  },
  {
    "nome": "Luis Augusto Mendes Oliveira",
    "tipo": "Outros",
    "cargo": "Estagiário(a)",
    "departamento": "T.I",
    "empresa": "GP SafeWork",
    "status": "Ativo",
    "admissao": "2026-03-02",
    "saida": null,
    "custoMensal": [0, 0, 1054.83, 1054.83, 1054.83, 1054.83, 1054.83, 1054.83, 0, 0, 0, 0]
  },
  {
    "nome": "Carlos Eduardo Campos Correa",
    "tipo": "PJ",
    "cargo": "Gerente",
    "departamento": "Processos",
    "empresa": "SafeHelp",
    "status": "Ativo",
    "admissao": "2023-05-24",
    "saida": null,
    "custoMensal": [4500.0, 4500.0, 4500.0, 4500.0, 4500.0, 4500.0, 4500.0, 4500.0, 0, 0, 0, 0]
  },
  {
    "nome": "Rafael Silva Vieira",
    "tipo": "Outros",
    "cargo": "Estagiário(a)",
    "departamento": "Processos",
    "empresa": "SafeHelp",
    "status": "Ativo",
    "admissao": "2024-09-23",
    "saida": null,
    "custoMensal": [1054.83, 1054.83, 1054.83, 1054.83, 1477.99, 1901.13, 1901.13, 1901.13, 0, 0, 0, 0]
  },
  {
    "nome": "Lucas Alamini Verza",
    "tipo": "Outros",
    "cargo": "Estagiário(a)",
    "departamento": "Processos",
    "empresa": "SafeHelp",
    "status": "Ativo",
    "admissao": "2026-04-07",
    "saida": null,
    "custoMensal": [0, 0, 0, 1054.83, 1054.83, 1054.83, 1054.83, 1054.83, 0, 0, 0, 0]
  },
  {
    "nome": "Janaina Flores Alexandre - SAFEMAIS",
    "tipo": "PJ",
    "cargo": "Auxiliar Administrativo",
    "departamento": "Administrativo",
    "empresa": "SafeMais",
    "status": "Ativo",
    "admissao": null,
    "saida": null,
    "custoMensal": [250.0, 550.0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  },
  {
    "nome": "Hillyard Adrian Galdino Pivato - SAFEMAIS",
    "tipo": "PJ",
    "cargo": "Téc. De Seg. do Trabalho",
    "departamento": "Engenharia",
    "empresa": "SafeMais",
    "status": "Ativo",
    "admissao": null,
    "saida": null,
    "custoMensal": [547.0, 320.0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  },
  {
    "nome": "Jhonatan Almeida Michelon",
    "tipo": "PJ",
    "cargo": "Engenheiro de SST",
    "departamento": "Engenharia",
    "empresa": "SafeMais",
    "status": "Ativo",
    "admissao": "2024-01-01",
    "saida": null,
    "custoMensal": [0, 300.0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  },
  {
    "nome": "Greicy Caroline Furtado",
    "tipo": "PJ",
    "cargo": "Auxiliar Administrativo",
    "departamento": "Medicina",
    "empresa": "SafeMais",
    "status": "Ativo",
    "admissao": "2026-01-19",
    "saida": null,
    "custoMensal": [923.0, 2200.0, 2266.15, 2376.23, 2589.8, 2854.91, 2698.24, 3093.13, 0, 0, 0, 0]
  },
  {
    "nome": "Bruna Vitoria Teixeira de Barros",
    "tipo": "PJ",
    "cargo": "Auxiliar Administrativo",
    "departamento": "Medicina",
    "empresa": "SafeMais",
    "status": "Ativo",
    "admissao": "2026-03-02",
    "saida": null,
    "custoMensal": [0, 0, 2200.0, 2200.0, 2200.0, 2200.0, 2200.0, 2200.0, 0, 0, 0, 0]
  },
  {
    "nome": "Letícia Rosso",
    "tipo": "Outros",
    "cargo": "Estagiário(a)",
    "departamento": "Medicina",
    "empresa": "SafeMais",
    "status": "Ativo",
    "admissao": "2026-05-06",
    "saida": null,
    "custoMensal": [0, 0, 0, 0, 1218.16, 1584.83, 1484.83, 1084.83, 0, 0, 0, 0]
  },
  {
    "nome": "Leticia Vieira Perico",
    "tipo": "PJ",
    "cargo": "Gerente",
    "departamento": "RH",
    "empresa": "SafeR&S",
    "status": "Ativo",
    "admissao": "2019-07-24",
    "saida": null,
    "custoMensal": [7000.0, 7000.0, 7000.0, 7000.0, 7000.0, 7000.0, 8000.0, 8000.0, 0, 0, 0, 0]
  },
  {
    "nome": "Eduarda Irene Colussi",
    "tipo": "PJ",
    "cargo": "Supervisor(a)",
    "departamento": "RH",
    "empresa": "SafeR&S",
    "status": "Ativo",
    "admissao": "2026-04-06",
    "saida": null,
    "custoMensal": [0, 0, 0, 1115.0, 2099.88, 3500.0, 3500.0, 3500.0, 0, 0, 0, 0]
  },
  {
    "nome": "Adauana Lúcia Goldschmidt",
    "tipo": "PJ",
    "cargo": "Auxiliar Administrativo",
    "departamento": "Treinamentos",
    "empresa": "SafeT",
    "status": "Ativo",
    "admissao": "2023-10-23",
    "saida": null,
    "custoMensal": [3109.39, 3441.61, 0, 0, 0, 0, 0, 3066.8, 0, 0, 0, 0]
  },
  {
    "nome": "Eduardo de Oliveira",
    "tipo": "PJ",
    "cargo": "Téc. De Seg. do Trabalho",
    "departamento": "Engenharia",
    "empresa": "SafeWork - Londrina",
    "status": "Ativo",
    "admissao": null,
    "saida": null,
    "custoMensal": [4663.0, 3340.0, 0, 1963.1, 1962.9, 2608.0, 4936.8, 0, 0, 0, 0, 0]
  },
  {
    "nome": "Rafael Fernando Trindade Lapezack Banhos",
    "tipo": "PJ",
    "cargo": "Téc. De Seg. do Trabalho",
    "departamento": "Engenharia",
    "empresa": "SafeWork - Londrina",
    "status": "Ativo",
    "admissao": "2024-03-02",
    "saida": null,
    "custoMensal": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  },
  {
    "nome": "Hillyard Adrian Galdino Pivato - LONDRINA",
    "tipo": "PJ",
    "cargo": "Téc. De Seg. do Trabalho",
    "departamento": "Engenharia",
    "empresa": "SafeWork - Londrina",
    "status": "Ativo",
    "admissao": null,
    "saida": null,
    "custoMensal": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  },
  {
    "nome": "Maria Aparecida Lopes Faria",
    "tipo": "PJ",
    "cargo": "Auxiliar de Limpeza",
    "departamento": "Administrativo",
    "empresa": "SafeWork Foz do Iguaçu",
    "status": "Ativo",
    "admissao": null,
    "saida": null,
    "custoMensal": [0, 0, 0, 0, 0, 0, 700.0, 2100.0, 0, 0, 0, 0]
  },
  {
    "nome": "Janaina Flores Alexandre - FOZ DO IGUAÇU",
    "tipo": "PJ",
    "cargo": "Auxiliar Administrativo",
    "departamento": "Administrativo",
    "empresa": "SafeWork Foz do Iguaçu",
    "status": "Ativo",
    "admissao": null,
    "saida": null,
    "custoMensal": [1400.0, 850.0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  },
  {
    "nome": "Tiago Maiorano",
    "tipo": "PJ",
    "cargo": "Téc. De Seg. do Trabalho",
    "departamento": "Engenharia",
    "empresa": "SafeWork Foz do Iguaçu",
    "status": "Ativo",
    "admissao": null,
    "saida": null,
    "custoMensal": [3866.0, 2096.66, 1930.0, 2668.0, 2740.0, 5420.0, 3420.0, 0, 0, 0, 0, 0]
  },
  {
    "nome": "Hillyard Adrian Galdino Pivato - FOZ DO IGUAÇU",
    "tipo": "PJ",
    "cargo": "Téc. De Seg. do Trabalho",
    "departamento": "Engenharia",
    "empresa": "SafeWork Foz do Iguaçu",
    "status": "Ativo",
    "admissao": null,
    "saida": null,
    "custoMensal": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  },
  {
    "nome": "Aline Gabriele Faria da Silva",
    "tipo": "PJ",
    "cargo": "Recepcionista",
    "departamento": "Medicina",
    "empresa": "SafeWork Foz do Iguaçu",
    "status": "Ativo",
    "admissao": "2024-08-16",
    "saida": null,
    "custoMensal": [2550.0, 2550.0, 2550.0, 3000.0, 3000.0, 3000.0, 3000.0, 3000.0, 0, 0, 0, 0]
  },
  {
    "nome": "Tais Carvalho",
    "tipo": "PJ",
    "cargo": "Téc. De Enfermagem",
    "departamento": "Medicina",
    "empresa": "SafeWork Foz do Iguaçu",
    "status": "Ativo",
    "admissao": "2024-01-10",
    "saida": null,
    "custoMensal": [2500.0, 2500.0, 2500.0, 2500.0, 2500.0, 2650.0, 3000.0, 3000.0, 0, 0, 0, 0]
  },
  {
    "nome": "Aline Vitória da Costa Becker",
    "tipo": "Outros",
    "cargo": "Estagiário(a)",
    "departamento": "Medicina",
    "empresa": "SafeWork Foz do Iguaçu",
    "status": "Ativo",
    "admissao": "2025-03-31",
    "saida": null,
    "custoMensal": [1184.83, 1184.83, 1284.83, 1184.83, 1644.83, 1604.83, 1184.83, 1424.83, 0, 0, 0, 0]
  },
  {
    "nome": "Raissa Gabriela Neves de Lara",
    "tipo": "PJ",
    "cargo": "Téc. De Enfermagem",
    "departamento": "Medicina",
    "empresa": "SafeWork Foz do Iguaçu",
    "status": "Ativo",
    "admissao": null,
    "saida": null,
    "custoMensal": [0, 0, 0, 0, 0, 1080.0, 0, 0, 0, 0, 0, 0]
  },
  {
    "nome": "Naidiane Gandolfi Pavoski",
    "tipo": "PJ",
    "cargo": "Téc. De Enfermagem",
    "departamento": "Medicina",
    "empresa": "SafeWork Foz do Iguaçu",
    "status": "Ativo",
    "admissao": null,
    "saida": null,
    "custoMensal": [0, 0, 0, 0, 0, 960.0, 0, 0, 0, 0, 0, 0]
  },
  {
    "nome": "Camilly Leseux Lopes",
    "tipo": "PJ",
    "cargo": "Téc. De Enfermagem",
    "departamento": "Medicina",
    "empresa": "SafeWork Foz do Iguaçu",
    "status": "Ativo",
    "admissao": null,
    "saida": null,
    "custoMensal": [0, 0, 220.0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  },
  {
    "nome": "Janaina Flores Alexandre - LONDRINA",
    "tipo": "PJ",
    "cargo": "Auxiliar Administrativo",
    "departamento": "Administrativo",
    "empresa": "SafeWork Londrina",
    "status": "Ativo",
    "admissao": null,
    "saida": null,
    "custoMensal": [550.0, 500.0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  },
  {
    "nome": "Milena Julia Pereira",
    "tipo": "PJ",
    "cargo": "Recepcionista",
    "departamento": "Medicina",
    "empresa": "SafeWork Londrina",
    "status": "Ativo",
    "admissao": "2025-04-01",
    "saida": null,
    "custoMensal": [2000.0, 2800.0, 3600.0, 3316.0, 3600.0, 3600.0, 3600.0, 3600.0, 2280.0, 0, 0, 0]
  },
  {
    "nome": "Debora Farias Souza",
    "tipo": "PJ",
    "cargo": "Téc. De Enfermagem",
    "departamento": "Medicina",
    "empresa": "SafeWork Londrina",
    "status": "Ativo",
    "admissao": "2024-01-04",
    "saida": null,
    "custoMensal": [2000.0, 1800.0, 2200.0, 2000.0, 2000.0, 2000.0, 2300.0, 2100.0, 400.0, 0, 0, 0]
  },
  {
    "nome": "Viviane Sampaio",
    "tipo": "PJ",
    "cargo": "Téc. De Enfermagem",
    "departamento": "Medicina",
    "empresa": "SafeWork Londrina",
    "status": "Ativo",
    "admissao": "2025-04-07",
    "saida": null,
    "custoMensal": [0, 1600.0, 1900.0, 1200.0, 900.0, 0, 100.0, 0, 0, 0, 0, 0]
  },
  {
    "nome": "Bedyouna Eleazar",
    "tipo": "Outros",
    "cargo": "Estagiário(a)",
    "departamento": "Medicina",
    "empresa": "SafeWork Londrina",
    "status": "Ativo",
    "admissao": "2026-05-26",
    "saida": null,
    "custoMensal": [0, 0, 0, 0, 381.49, 1384.83, 1384.83, 1384.83, 0, 0, 0, 0]
  },
  {
    "nome": "Natalia Cristine Soares",
    "tipo": "PJ",
    "cargo": "Téc. De Enfermagem",
    "departamento": "Medicina",
    "empresa": "SafeWork Londrina",
    "status": "Ativo",
    "admissao": "2021-07-01",
    "saida": null,
    "custoMensal": [400.0, 320.0, 400.0, 320.0, 320.0, 320.0, 400.0, 320.0, 0, 0, 0, 0]
  },
  {
    "nome": "Leticya Hellen Cardoso Dias",
    "tipo": "PJ",
    "cargo": "Téc. De Enfermagem",
    "departamento": "Medicina",
    "empresa": "SafeWork Londrina",
    "status": "Ativo",
    "admissao": "2025-12-15",
    "saida": null,
    "custoMensal": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  },
  {
    "nome": "Janaina Flores Alexandre - MEDIANEIRA",
    "tipo": "PJ",
    "cargo": "Auxiliar Administrativo",
    "departamento": "Administrativo",
    "empresa": "SafeWork Medianeira",
    "status": "Ativo",
    "admissao": "2024-12-15",
    "saida": null,
    "custoMensal": [1350.0, 800.0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  },
  {
    "nome": "Diego Antonio Chies",
    "tipo": "PJ",
    "cargo": "Gerente",
    "departamento": "Engenharia",
    "empresa": "SafeWork Medianeira",
    "status": "Ativo",
    "admissao": "2026-04-06",
    "saida": null,
    "custoMensal": [0, 0, 0, 7000.0, 7000.0, 7000.0, 7000.0, 7000.0, 0, 0, 0, 0]
  },
  {
    "nome": "Hillyard Adrian Galdino Pivato - MEDIANEIRA",
    "tipo": "PJ",
    "cargo": "Téc. De Seg. do Trabalho",
    "departamento": "Engenharia",
    "empresa": "SafeWork Medianeira",
    "status": "Ativo",
    "admissao": "2023-05-16",
    "saida": null,
    "custoMensal": [6467.0, 4819.5, 4295.0, 4181.5, 2602.2, 6354.0, 0, 0, 0, 0, 0, 0]
  },
  {
    "nome": "Adriano Carlesso Persch",
    "tipo": "PJ",
    "cargo": "Téc. De Seg. do Trabalho",
    "departamento": "Engenharia",
    "empresa": "SafeWork Medianeira",
    "status": "Ativo",
    "admissao": null,
    "saida": null,
    "custoMensal": [0, 0, 0, 0, 0, 0, 2684.0, 4330.0, 0, 0, 0, 0]
  },
  {
    "nome": "Jhonatan Almeida Michelon",
    "tipo": "PJ",
    "cargo": "Téc. De Seg. do Trabalho",
    "departamento": "Engenharia",
    "empresa": "SafeWork Medianeira",
    "status": "Ativo",
    "admissao": null,
    "saida": null,
    "custoMensal": [0, 300.0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  },
  {
    "nome": "Lucia Aparecida Nascimento",
    "tipo": "CLT",
    "cargo": "Auxiliar de Limpeza",
    "departamento": "Geral",
    "empresa": "SafeWork Medianeira",
    "status": "Ativo",
    "admissao": "2021-03-25",
    "saida": null,
    "custoMensal": [2856.52, 2856.52, 2856.52, 2856.52, 2856.52, 2856.52, 2867.52, 4538.8, 0, 0, 0, 0]
  },
  {
    "nome": "Ana Paula Jesus Soares Barbosa",
    "tipo": "PJ",
    "cargo": "Fonoaudiólogo(a)",
    "departamento": "Medicina",
    "empresa": "SafeWork Medianeira",
    "status": "Ativo",
    "admissao": "2025-05-16",
    "saida": null,
    "custoMensal": [1390.0, 1750.0, 2515.0, 2665.0, 2075.0, 2385.0, 2460.0, 2720.0, 0, 0, 0, 0]
  },
  {
    "nome": "Francielli Letícia Klaus da Silva",
    "tipo": "PJ",
    "cargo": "Recepcionista",
    "departamento": "Medicina",
    "empresa": "SafeWork Medianeira",
    "status": "Ativo",
    "admissao": "2022-09-01",
    "saida": null,
    "custoMensal": [4000.0, 0, 0, 0, 600.0, 2667.0, 4000.0, 4000.0, 0, 0, 0, 0]
  },
  {
    "nome": "Roseli Ferreira da Silva",
    "tipo": "Outros",
    "cargo": "Estagiário(a)",
    "departamento": "Medicina",
    "empresa": "SafeWork Medianeira",
    "status": "Ativo",
    "admissao": "2024-09-23",
    "saida": null,
    "custoMensal": [1484.83, 1484.83, 1484.83, 1484.83, 1484.83, 1484.83, 1584.83, 1484.83, 0, 0, 0, 0]
  },
  {
    "nome": "Gabrielly Costa de Carvalho",
    "tipo": "PJ",
    "cargo": "Téc. De Enfermagem",
    "departamento": "Medicina",
    "empresa": "SafeWork Medianeira",
    "status": "Ativo",
    "admissao": "2026-01-05",
    "saida": null,
    "custoMensal": [2135.0, 2735.0, 2735.0, 2500.0, 1315.0, 0, 0, 0, 0, 0, 0, 0]
  },
  {
    "nome": "Adriely Oliveira",
    "tipo": "PJ",
    "cargo": "Téc. De Enfermagem",
    "departamento": "Medicina",
    "empresa": "SafeWork Medianeira",
    "status": "Ativo",
    "admissao": "2026-03-10",
    "saida": null,
    "custoMensal": [0, 0, 660.0, 650.0, 1950.0, 1820.0, 1690.0, 1820.0, 0, 0, 0, 0]
  },
  {
    "nome": "Verginia Cristiane Gomes Gaio",
    "tipo": "PJ",
    "cargo": "Fonoaudiólogo(a)",
    "departamento": "Medicina",
    "empresa": "SafeWork Medianeira",
    "status": "Ativo",
    "admissao": null,
    "saida": null,
    "custoMensal": [0, 0, 0, 0, 0, 840.0, 990.0, 840.0, 0, 0, 0, 0]
  },
  {
    "nome": "Daniela de Souza Batista",
    "tipo": "PJ",
    "cargo": "Téc. De Enfermagem",
    "departamento": "Medicina",
    "empresa": "SafeWork Medianeira",
    "status": "Ativo",
    "admissao": null,
    "saida": null,
    "custoMensal": [0, 120.0, 300.0, 0, 0, 150.0, 0, 0, 0, 0, 0, 0]
  },
  {
    "nome": "Ana Paula Ticiane de Sales",
    "tipo": "PJ",
    "cargo": "Téc. De Enfermagem",
    "departamento": "Medicina",
    "empresa": "SafeWork Medianeira",
    "status": "Ativo",
    "admissao": null,
    "saida": null,
    "custoMensal": [0, 120.0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  },
  {
    "nome": "Jéssica de Vasconcelos",
    "tipo": "PJ",
    "cargo": "Téc. De Enfermagem",
    "departamento": "Medicina",
    "empresa": "SafeWork Medianeira",
    "status": "Ativo",
    "admissao": "2025-11-06",
    "saida": null,
    "custoMensal": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  },
  {
    "nome": "Luana Correia",
    "tipo": "PJ",
    "cargo": "Téc. De Enfermagem",
    "departamento": "Medicina",
    "empresa": "SafeWork Medianeira",
    "status": "Ativo",
    "admissao": "2026-07-31",
    "saida": null,
    "custoMensal": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  },
  {
    "nome": "Thaylla Dos Santos Trindade",
    "tipo": "PJ",
    "cargo": "Téc. De Enfermagem",
    "departamento": "Medicina",
    "empresa": "SafeWork Medianeira",
    "status": "Ativo",
    "admissao": null,
    "saida": null,
    "custoMensal": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  },
  {
    "nome": "Janaina Flores Alexandre - SANTA HELENA",
    "tipo": "PJ",
    "cargo": "Auxiliar Administrativo",
    "departamento": "Administrativo",
    "empresa": "SafeWork Santa Helena",
    "status": "Ativo",
    "admissao": null,
    "saida": null,
    "custoMensal": [550.0, 500.0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  },
  {
    "nome": "Hillyard Adrian Galdino Pivato - SANTA HELENA",
    "tipo": "PJ",
    "cargo": "Téc. De Seg. do Trabalho",
    "departamento": "Engenharia",
    "empresa": "SafeWork Santa Helena",
    "status": "Ativo",
    "admissao": null,
    "saida": null,
    "custoMensal": [3747.0, 1939.5, 0, 1845.5, 0, 0, 0, 0, 0, 0, 0, 0]
  },
  {
    "nome": "Loreni Terezinha de Jesus",
    "tipo": "PJ",
    "cargo": "Auxiliar de Limpeza",
    "departamento": "Geral",
    "empresa": "SafeWork Santa Helena",
    "status": "Ativo",
    "admissao": null,
    "saida": null,
    "custoMensal": [640.0, 560.0, 720.0, 640.0, 640.0, 640.0, 640.0, 640.0, 0, 0, 0, 0]
  },
  {
    "nome": "Jiani Veronica Jung",
    "tipo": "PJ",
    "cargo": "Supervisor(a)",
    "departamento": "Medicina",
    "empresa": "SafeWork Santa Helena",
    "status": "Ativo",
    "admissao": "2015-05-04",
    "saida": null,
    "custoMensal": [4900.0, 4900.0, 5500.0, 5500.0, 5500.0, 5500.0, 5500.0, 5500.0, 0, 0, 0, 0]
  },
  {
    "nome": "Ana Caroline Silva dos Santos",
    "tipo": "PJ",
    "cargo": "Auxiliar Administrativo",
    "departamento": "Medicina",
    "empresa": "SafeWork Santa Helena",
    "status": "Ativo",
    "admissao": "2025-12-01",
    "saida": null,
    "custoMensal": [2000.0, 2000.0, 2000.0, 2000.0, 1800.0, 2000.0, 2000.0, 2000.0, 0, 0, 0, 0]
  },
  {
    "nome": "Jakeline Klassen Macedo",
    "tipo": "PJ",
    "cargo": "Téc. De Enfermagem",
    "departamento": "Medicina",
    "empresa": "SafeWork Santa Helena",
    "status": "Ativo",
    "admissao": "2024-08-15",
    "saida": null,
    "custoMensal": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  },
  {
    "nome": "Raissa Maria Tartari Ribeiro",
    "tipo": "PJ",
    "cargo": "Auxiliar Administrativo",
    "departamento": "Administrativo",
    "empresa": "GP SafeWork",
    "status": "Inativo",
    "admissao": "2024-03-18",
    "saida": "2026-02-27",
    "custoMensal": [2625.0, 2490.0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  },
  {
    "nome": "Matheus Vinicius Mayer",
    "tipo": "CLT",
    "cargo": "Consultor Estratégico de vendas",
    "departamento": "Comercial",
    "empresa": "GP SafeWork",
    "status": "Inativo",
    "admissao": "2021-12-01",
    "saida": "2026-03-25",
    "custoMensal": [3000.36, 3494.46, 9518.4, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  },
  {
    "nome": "Carolina Tavares",
    "tipo": "PJ",
    "cargo": "Auxiliar Administrativo",
    "departamento": "Comercial",
    "empresa": "GP SafeWork",
    "status": "Inativo",
    "admissao": "2025-07-09",
    "saida": "2026-04-30",
    "custoMensal": [2000.0, 2200.0, 2200.0, 2200.0, 0, 0, 0, 0, 0, 0, 0, 0]
  },
  {
    "nome": "Polyanna Carrer",
    "tipo": "PJ",
    "cargo": "Consultor Comercial",
    "departamento": "Comercial",
    "empresa": "GP SafeWork",
    "status": "Inativo",
    "admissao": "2025-05-13",
    "saida": "2026-01-30",
    "custoMensal": [2196.05, 89.32, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  },
  {
    "nome": "Jessica Aparecida Morais",
    "tipo": "PJ",
    "cargo": "Consultor Comercial",
    "departamento": "Comercial",
    "empresa": "GP SafeWork",
    "status": "Inativo",
    "admissao": "2025-10-01",
    "saida": "2026-01-06",
    "custoMensal": [540.0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  },
  {
    "nome": "Weiniane Emanuelle Monteiro Meira",
    "tipo": "PJ",
    "cargo": "Auxiliar Administrativo",
    "departamento": "Comercial",
    "empresa": "GP SafeWork",
    "status": "Inativo",
    "admissao": "2026-05-07",
    "saida": "2026-05-19",
    "custoMensal": [0, 0, 0, 0, 535.0, 0, 0, 0, 0, 0, 0, 0]
  },
  {
    "nome": "Jéssica Crestani",
    "tipo": "PJ",
    "cargo": "Auxiliar Administrativo",
    "departamento": "Comercial",
    "empresa": "GP SafeWork",
    "status": "Inativo",
    "admissao": "2025-11-03",
    "saida": "2026-12-19",
    "custoMensal": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  },
  {
    "nome": "Maria Leticia Gonçalves Espindola",
    "tipo": "PJ",
    "cargo": "Auxiliar Administrativo",
    "departamento": "Financeiro",
    "empresa": "GP SafeWork",
    "status": "Inativo",
    "admissao": "2024-07-08",
    "saida": "2026-08-24",
    "custoMensal": [3000.0, 3000.0, 3000.0, 3000.0, 3000.0, 2800.0, 2901.0, 4500.0, 0, 0, 0, 0]
  },
  {
    "nome": "Murilo Henrique Gonçalves",
    "tipo": "PJ",
    "cargo": "Auxiliar Administrativo",
    "departamento": "Financeiro",
    "empresa": "GP SafeWork",
    "status": "Inativo",
    "admissao": "2025-02-13",
    "saida": "2026-01-10",
    "custoMensal": [0, 1127.0, 2600.0, 2600.0, 2600.0, 2600.0, 3000.0, 3000.0, 0, 0, 0, 0]
  },
  {
    "nome": "Giovanna Mara Planelis",
    "tipo": "Outros",
    "cargo": "Estagiário(a)",
    "departamento": "Financeiro",
    "empresa": "GP SafeWork",
    "status": "Inativo",
    "admissao": "2025-05-26",
    "saida": "2026-08-11",
    "custoMensal": [1100.96, 1584.83, 1584.83, 1554.83, 1584.83, 1584.83, 1584.83, 0, 0, 0, 0, 0]
  },
  {
    "nome": "Luccas Eduardo Facundo",
    "tipo": "PJ",
    "cargo": "Analista",
    "departamento": "Marketing",
    "empresa": "GP SafeWork",
    "status": "Inativo",
    "admissao": "2026-03-11",
    "saida": "2026-08-12",
    "custoMensal": [0, 0, 1400.0, 2000.0, 2000.0, 2250.0, 3000.0, 1200.0, 0, 0, 0, 0]
  },
  {
    "nome": "João Rafael Savite Petrowisch Nicolichi",
    "tipo": "PJ",
    "cargo": "Auxiliar Administrativo",
    "departamento": "Processos",
    "empresa": "SafeHelp",
    "status": "Inativo",
    "admissao": "2023-04-03",
    "saida": "2026-07-16",
    "custoMensal": [1920.0, 1920.0, 1920.0, 1920.0, 1920.0, 1920.0, 1152.0, 0, 0, 0, 0, 0]
  },
  {
    "nome": "Herick Campos Callegari",
    "tipo": "Outros",
    "cargo": "Estagiário(a)",
    "departamento": "Processos",
    "empresa": "SafeHelp",
    "status": "Inativo",
    "admissao": "2026-03-27",
    "saida": "2026-09-03",
    "custoMensal": [0, 0, 318.7, 1404.83, 1534.83, 1534.83, 1534.83, 1534.83, 0, 0, 0, 0]
  },
  {
    "nome": "Kíria Vitória Nakahati",
    "tipo": "Outros",
    "cargo": "Estagiário(a)",
    "departamento": "Processos",
    "empresa": "SafeHelp",
    "status": "Inativo",
    "admissao": "2026-03-27",
    "saida": "2026-07-03",
    "custoMensal": [0, 0, 241.29, 1054.83, 1054.83, 1054.83, 0, 0, 0, 0, 0, 0]
  },
  {
    "nome": "Huender Eduardo Souza de Lima",
    "tipo": "Outros",
    "cargo": "Estagiário(a)",
    "departamento": "Processos",
    "empresa": "SafeHelp",
    "status": "Inativo",
    "admissao": "2025-01-27",
    "saida": "2026-07-31",
    "custoMensal": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  },
  {
    "nome": "Juan Lucas Ferreira de Lima",
    "tipo": "PJ",
    "cargo": "Auxiliar Administrativo",
    "departamento": "Credenciamento",
    "empresa": "SafeMais",
    "status": "Inativo",
    "admissao": "2026-02-10",
    "saida": "2026-07-09",
    "custoMensal": [0, 1394.0, 2200.0, 2200.0, 2200.0, 2200.0, 550.0, 0, 0, 0, 0, 0]
  },
  {
    "nome": "Gabriela Foza Dahmer",
    "tipo": "PJ",
    "cargo": "Auxiliar Administrativo",
    "departamento": "Credenciamento",
    "empresa": "SafeMais",
    "status": "Inativo",
    "admissao": "2023-10-02",
    "saida": "2026-02-26",
    "custoMensal": [3000.0, 3000.0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  },
  {
    "nome": "Bruna Stefani Amarante",
    "tipo": "CLT",
    "cargo": "Supervisor(a)",
    "departamento": "E-Social",
    "empresa": "SafeMais",
    "status": "Inativo",
    "admissao": "2022-02-02",
    "saida": "2026-07-17",
    "custoMensal": [3930.25, 3558.36, 3558.36, 3576.86, 3558.36, 3632.36, 8013.22, 0, 0, 0, 0, 0]
  },
  {
    "nome": "Patricia Raissa Santos Santiago",
    "tipo": "Outros",
    "cargo": "Estagiário(a)",
    "departamento": "Engenharia",
    "empresa": "SafeMais",
    "status": "Inativo",
    "admissao": "2025-11-10",
    "saida": "2026-02-13",
    "custoMensal": [1554.83, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  },
  {
    "nome": "Igor Gabriel de Almeida da Costa",
    "tipo": "PJ",
    "cargo": "Auxiliar Administrativo",
    "departamento": "Medicina",
    "empresa": "SafeMais",
    "status": "Inativo",
    "admissao": "2025-11-03",
    "saida": "2026-07-17",
    "custoMensal": [2000.0, 2000.0, 2000.0, 2000.0, 2000.0, 2000.0, 1133.33, 0, 0, 0, 0, 0]
  },
  {
    "nome": "Ewellin Patricia Iberss",
    "tipo": "PJ",
    "cargo": "Auxiliar Administrativo",
    "departamento": "Medicina",
    "empresa": "SafeMais",
    "status": "Inativo",
    "admissao": "2025-08-04",
    "saida": "2026-04-30",
    "custoMensal": [2350.0, 2350.0, 2350.0, 2350.0, 1000.0, 850.0, 550.0, 250.0, 0, 0, 0, 0]
  },
  {
    "nome": "Eduardo de Oliveira Forlin",
    "tipo": "PJ",
    "cargo": "Auxiliar Administrativo",
    "departamento": "Medicina",
    "empresa": "SafeMais",
    "status": "Inativo",
    "admissao": "2026-01-21",
    "saida": "2026-06-30",
    "custoMensal": [781.0, 2200.0, 2200.0, 2200.0, 2200.0, 2200.0, 0, 0, 0, 0, 0, 0]
  },
  {
    "nome": "Geyci Santos de Carvalho",
    "tipo": "Outros",
    "cargo": "Estagiário(a)",
    "departamento": "Medicina",
    "empresa": "SafeMais",
    "status": "Inativo",
    "admissao": "2026-03-09",
    "saida": "2026-04-28",
    "custoMensal": [0, 0, 1133.54, 1704.83, 2100.0, 2200.0, 2200.0, 0, 0, 0, 0, 0]
  },
  {
    "nome": "Andreina da Paz Costa de Brito",
    "tipo": "PJ",
    "cargo": "Auxiliar Administrativo",
    "departamento": "Medicina",
    "empresa": "SafeMais",
    "status": "Inativo",
    "admissao": "2025-09-25",
    "saida": "2026-03-05",
    "custoMensal": [2400.0, 1020.0, 150.0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  },
  {
    "nome": "Eduarda Irene Colussi",
    "tipo": "CLT",
    "cargo": "Supervisor(a)",
    "departamento": "RH",
    "empresa": "SafeR&S",
    "status": "Inativo",
    "admissao": "2021-12-03",
    "saida": "2026-04-04",
    "custoMensal": [0, 0, 0, 1115.0, 2099.88, 3500.0, 3500.0, 3500.0, 0, 0, 0, 0]
  },
  {
    "nome": "Petra Silveira Machado",
    "tipo": "PJ",
    "cargo": "Auxiliar Administrativo",
    "departamento": "Treinamentos",
    "empresa": "SafeT",
    "status": "Inativo",
    "admissao": "2026-02-05",
    "saida": "2026-07-31",
    "custoMensal": [0, 1760.0, 2200.0, 2405.05, 2503.6, 2303.3, 2645.46, 0, 0, 0, 0, 0]
  },
  {
    "nome": "Líndicen Eduarda Carvalho dos Santos",
    "tipo": "Outros",
    "cargo": "Estagiário(a)",
    "departamento": "Medicina",
    "empresa": "SafeWork Londrina",
    "status": "Inativo",
    "admissao": "2025-09-01",
    "saida": "2026-02-09",
    "custoMensal": [2684.83, 502.68, 220.0, 670.0, 550.0, 0, 300.0, 0, 0, 0, 0, 0]
  },
  {
    "nome": "Guilherme Oku Fernandes",
    "tipo": "PJ",
    "cargo": "Médico(a) RT",
    "departamento": "Medicina",
    "empresa": "SafeWork Londrina",
    "status": "Inativo",
    "admissao": "2025-05-01",
    "saida": "2026-02-28",
    "custoMensal": [1850.0, 1850.0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  },
  {
    "nome": "Thais Brito Siqueira Santos",
    "tipo": "Outros",
    "cargo": "Estagiário(a)",
    "departamento": "Medicina",
    "empresa": "SafeWork Londrina",
    "status": "Inativo",
    "admissao": "2026-03-23",
    "saida": "2026-04-02",
    "custoMensal": [0, 0, 476.77, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  },
  {
    "nome": "Ana Luiza da Silva Rodrigues",
    "tipo": "Outros",
    "cargo": "Estagiário(a)",
    "departamento": "Medicina",
    "empresa": "SafeWork Londrina",
    "status": "Inativo",
    "admissao": "2026-01-26",
    "saida": "2026-01-27",
    "custoMensal": [164.18, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  },
  {
    "nome": "Diego Antonio Chies",
    "tipo": "CLT",
    "cargo": "Coordenador(a)",
    "departamento": "Engenharia",
    "empresa": "SafeWork Medianeira",
    "status": "Inativo",
    "admissao": "2018-03-01",
    "saida": "2026-04-04",
    "custoMensal": [0, 0, 0, 7000.0, 7000.0, 7000.0, 7000.0, 7000.0, 0, 0, 0, 0]
  },
  {
    "nome": "Camila Jung",
    "tipo": "PJ",
    "cargo": "Téc. De Enfermagem",
    "departamento": "Medicina",
    "empresa": "SafeWork Medianeira",
    "status": "Inativo",
    "admissao": "2025-03-17",
    "saida": "2026-07-17",
    "custoMensal": [3750.0, 3900.0, 3750.0, 3800.0, 3750.0, 3750.0, 2001.66, 0, 0, 0, 0, 0]
  },
  {
    "nome": "Camila Nunes Correia",
    "tipo": "Outros",
    "cargo": "Estagiário(a)",
    "departamento": "Medicina",
    "empresa": "SafeWork Medianeira",
    "status": "Inativo",
    "admissao": "2025-09-29",
    "saida": "2026-02-06",
    "custoMensal": [1054.83, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  }
] as Pessoa[]

/**
 * Nome de unidade sem as variações de digitação da planilha.
 *
 * "SafeWork Londrina" e "SafeWork - Londrina" são a mesma unidade e apareciam
 * como duas, com 7 e 3 pessoas. Normalizar na leitura em vez de corrigir o
 * arquivo gerado: a planilha é reextraída todo mês e a variação voltaria.
 */
export function normalizarEmpresa(nome: string): string {
  const limpo = nome.replace(/\s*-\s*/g, ' ').replace(/\s+/g, ' ').trim()
  if (!limpo) return '(sem empresa)'
  return limpo
}

/** Quem estava no quadro no fim do mês (0-11). */
export function ativosNoMes(mes: number, ano = 2026): Pessoa[] {
  const fim = new Date(ano, mes + 1, 0)
  return PESSOAS.filter(p => {
    const entrou = p.admissao ? new Date(p.admissao + 'T12:00:00') <= fim : true
    const saiu = p.saida ? new Date(p.saida + 'T12:00:00') < fim : false
    return entrou && !saiu
  })
}
