# Comandas, caixa e comissões — regras de negócio

Comandas, caixa e comissões vivem **só no painel admin** (não há rotas `/api/v1` para isso). Este guia resume as regras do dia a dia na barbearia.

---

## Regras de negócio

| Regra | Detalhe |
| --- | --- |
| Comanda por cliente/dia | Uma comanda **aberta** por WhatsApp + data; agrupa todos os agendamentos **ativos** do mesmo cliente naquele dia (ex.: 12h com um barbeiro e 15h com outro) |
| Nova comanda no mesmo dia | Depois de **fechar** a comanda, um novo agendamento do cliente naquele dia abre **outra** comanda — não mistura com a já finalizada |
| Encaixes na comanda | Encaixes manuais do mesmo cliente no dia entram na comanda automaticamente (serviços + lista de atendimentos) |
| Extras na comanda | Serviço adicionado na comanda além dos do agendamento vira **encaixe** na agenda |
| Produtos na comanda | Item com produto; barbeiro é **opcional**. Sem barbeiro: **sem comissão** (100% barbearia). Com barbeiro: % do produto |
| Comissão | % sobre o valor **cobrado** de cada **serviço** (configurável por barbeiro). Produto: % do cadastro **só se** houver barbeiro |
| Gorjeta | Opcional ao fechar; o barbeiro escolhido recebe **100%** (entra no total e no caixa) |
| Crédito do cliente | Saldo por cliente; pode pagar comanda com crédito da loja; troco ou depósito vira crédito e **entra no caixa** pelo método de origem (Pix, dinheiro etc.) |
| Uso de crédito | Pagamento com crédito da loja **não** entra no caixa (dinheiro já entrou antes), mas **gera comissão** normalmente |
| Quem fecha | **Dono** no painel; barbeiro se tiver permissão |
| Taxa de cartão | **Não** entra no cálculo da comissão |
| Pagamento misto | Várias formas na mesma comanda (ex.: R$ 50 Pix + R$ 50 dinheiro) |
| Preço editável | Cada linha da comanda guarda o preço cobrado (não altera a tabela de serviços) |
| Barbeiro na comanda | Em **serviços**, exibido mas **não editável** na comanda — altere na agenda. Em **produtos**, pode ser omitido ou escolhido na hora |
| Fechar comanda | Registra pagamento, marca atendimentos como concluídos e entra no caixa/comissão |
| Caixa do dia | Precisa estar **aberto** para finalizar comandas daquele dia |
| Um caixa por vez | Só pode haver **um** caixa aberto; feche o atual antes de abrir outro dia |
| Comanda no caixa | Só fecha comanda do **mesmo dia** do caixa aberto; fica vinculada à sessão |
| Reabrir comanda | Remove do caixa do dia; agendamento volta a ser editável; **estorna** depósitos e usos de crédito ligados à comanda. Se o cliente já gastou esse crédito em outro lugar, a tela pede confirmação e estorna só o que ainda sobrar no saldo |
| Cancelar horário | Motivo obrigatório; some da agenda; **bloqueado** se a comanda estiver fechada (reabra antes) |

Formas de pagamento aceitas: Pix, dinheiro, débito, crédito e crédito da loja.

**Crédito do cliente:** depósitos (troco ou valor extra ao fechar comanda) entram no caixa do dia pelo método informado. Pagamentos com crédito da loja não somam nas entradas do caixa.

No painel **Financeiro**, **Entradas no caixa** soma pagamentos reais + depósitos de crédito; **Faturamento em serviços** é só o valor dos atendimentos (base das comissões).

O painel **Financeiro** (`/admin/financeiro`, só dono) abre em **visão geral enxuta** (período + faturamento, comissões, serviços, ticket médio + evolução das entradas) e permite **abrir o detalhe de cada métrica** (`?metric=faturamento|caixa|ticket|servicos|comissoes`): dia a dia, dia da semana, ranking e por barbeiro conforme a métrica.

No menu lateral, a ordem é: Agenda → Caixas → Comissões → Financeiro.

---

## Painel admin (financeiro)

Somente o **dono** vê as rotas abaixo (menu **Dia a dia** na sidebar). O barbeiro vê **Minhas comissões**.

| Rota | Função |
| --- | --- |
| `/admin` (aba **CAIXA**) | Operar o caixa do dia na agenda: **saldo em destaque**, entradas/comissões/barbearia, barras por forma de pagamento, lista de comandas fechadas, abrir/encerrar caixa e link para métricas |
| `/admin/financeiro` | Dashboard de métricas por período: KPIs, evolução diária, pagamentos e barbeiros (comparação com período anterior) |
| `/admin/financeiro/caixas` | Histórico de sessões de caixa: filtro por período, busca, abrir/fechar/reabrir, links para agenda e comissões |
| `/admin/financeiro/comissoes` | Comissões por barbeiro no período (dia do atendimento/caixa). Ao **detalhar** um barbeiro: resumo com **faturamento**, **comissão** e **serviços**, **dia a dia**, ranking de serviços, lista de **atendimentos** e formas de pagamento. Produtos sem profissional **não** entram no repasse |

- **Agenda:** clique no horário → modal de comanda (fechar, reabrir, pagamento misto; produto com opção **Sem profissional**)
- **Profissionais:** campo **% de comissão** no cadastro de cada barbeiro

Relatórios do painel filtram comandas fechadas pelo **dia do atendimento / dia do caixa**, não pelo horário em que a comanda foi fechada.
