# MOS v2.0 Module Dependency / Ownership Matrix
Status: FROZEN

| Work / Module | Owner | Depends on | Forbidden |
|---|---|---|---|
| BOOT-001/002 | TL | ZCode fork | treating chat as authority |
| BOOT-003 | TL + B | BOOT-002 | broad ZCode imports |
| mos-contracts | TL | none beyond substrate | domain implementation |
| identity/missions/policy/rights/content | A | contracts + identity chain | direct provider/engine imports |
| production | B | content/rights/policy | provider publishing |
| agents/agent-runtime | B | contracts + ZCode adapter | second model router |
| capabilities/engines/jobs | B | contracts | marketplace authority |
| lab | A | contracts/content/production/agents/capabilities/engines/jobs | direct providers, real publishing |
| studio | C | contracts/content/production/agents/capabilities/engines/jobs/rights | workflow, experiment, publisher authority |
| integrations/distribution | C | contracts/content/rights/policy | Lab/Studio bypass |
| experiments | C | missions/production/distribution/jobs | alternate Experiment/Evidence authority |
| web/desktop | C | contracts | direct DB/domain mutation |
| product-intelligence/commerce | A | contracts/identity/rights | commerce truth shadowing |

## Dependency directions

Allowed:
domain → contracts
application → domain/contracts
adapter → application/domain/contracts
Studio → capability/engine ports
Lab → capability/engine ports
Integration → external providers
ZCode adapters → ZCode substrate.

Forbidden:
domain → concrete engine library
Studio → social provider SDK
Lab → social provider SDK
Lab → direct experiment writes
Studio → workflow authority
Engine → MOS DB credentials
Engine → provider credentials
UI → database mutation
ZCode service → MOS business authority
