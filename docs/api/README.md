# Documentação auxiliar da API

As rotas em `/api/v1` são **internas do produto** — usadas pelo site `/agenda` e pelo painel.  
**Não há** chaves de API, OpenAPI público, app mobile nem integrações externas (n8n etc.).

| Documento | Conteúdo |
| --- | --- |
| [../ARQUITETURA.md](../ARQUITETURA.md) (seção **API interna**) | Contrato das rotas `/api/v1`, sessão do cliente e autenticação |
| [financeiro.md](./financeiro.md) | Comandas, caixa e comissões no painel (sem rotas REST) |

## Sessão do cliente (resumo)

1. O cliente informa o WhatsApp em qualquer aba do site (`Agendar`, `Horários` ou `Conta`).
2. `POST /api/agenda/session` grava o cookie `agenda_client_session` (~14 dias), ligado à loja (`shop` = slug).
3. As rotas privadas de `/api/v1` aceitam esse cookie (ou o mesmo token no header `Authorization: Bearer …`).
4. `DELETE /api/agenda/session` encerra a sessão.

Rotas públicas de catálogo e disponibilidade precisam da loja na query: `?shop={slug}`.
