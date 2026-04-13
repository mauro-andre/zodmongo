# ZodMongo — Plano de Implementacao

## O que e

ODM (Object-Document Mapper) leve para MongoDB usando Zod para validacao de schemas. Usa o driver nativo do MongoDB (sem Mongoose). TypeScript-first.

## Origem

Extraido do PodCubo, onde esta em producao. Arquivos fonte:

- **`/var/mnt/data/dev-projects/podcubo/db/db.engine.ts`** — engine completa (connect, save, findMany, deleteMany, transformacoes id/_id/ObjectId)
- **`/var/mnt/data/dev-projects/podcubo/db/db.models.ts`** — schema base (DbModel com id, createdAt, updatedAt) e idSchema

## Funcionalidades atuais (ja implementadas no PodCubo)

### Core
- **`connectDB(uri, dbName)`** — conecta ao MongoDB
- **`getDB()`** — retorna a instancia do Db
- **`closeDB()`** — fecha conexao (aguarda promises pendentes)
- **`save(collection, doc, filter?, options?)`** — upsert inteligente (insert ou update)
- **`findMany(collection, matchOrPipeline?, options?)`** — busca com aggregation pipeline ou match simples
- **`deleteMany(collection, filter)`** — deleta documentos

### Transformacoes automaticas
- `id` (string) ↔ `_id` (ObjectId) — conversao automatica bidirecional
- Strings validas como ObjectId sao convertidas automaticamente em queries
- Recursivo — funciona em objetos aninhados e arrays
- `createdAt` setado automaticamente no insert
- `updatedAt` setado automaticamente em todo update

### Schema base (Zod)
- `dbModelSchema` — schema com `id`, `createdAt`, `updatedAt`
- `idSchema` — string que valida como ObjectId
- Todo model do usuario estende `dbModelSchema`

### Paginacao
- `findMany` com `{ paginate: true }` retorna `{ docs, currentPage, pageQuantity, docsQuantity }`
- Implementado via `$facet` no aggregation pipeline

### Promise tracking
- `trackPromise()` — registra promises pendentes
- `closeDB()` aguarda todas antes de fechar

## Estrutura do pacote npm

```
zodmongo/
├── src/
│   ├── index.ts          — export publico (connect, save, findMany, deleteMany, etc.)
│   ├── engine.ts         — engine do MongoDB (adaptado de db.engine.ts)
│   ├── schema.ts         — dbModelSchema, idSchema, DbModel, Id
│   └── transforms.ts     — funcoes de transformacao _id/id/ObjectId
├── tests/
│   ├── setup.ts          — conecta ao MongoDB de teste
│   ├── engine.test.ts    — testes do save, findMany, deleteMany
│   ├── transforms.test.ts — testes de conversao id/_id/ObjectId
│   ├── pagination.test.ts — testes de paginacao
│   └── schema.test.ts    — testes do dbModelSchema e idSchema
├── site/                 — site com VeloJS (documentacao)
│   ├── app/
│   └── vite.config.ts
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

## API publica planejada

```typescript
import { connect, close, save, findMany, deleteMany, getDb } from "zodmongo";
import { dbModelSchema, idSchema } from "zodmongo/schema";
import type { DbModel, Id, PaginateResponse } from "zodmongo";

// Conectar
await connect("mongodb://localhost:27017", "mydb");

// Schema do usuario (estende dbModelSchema)
const userSchema = dbModelSchema.extend({
    name: z.string(),
    email: z.string().email(),
});
type User = z.infer<typeof userSchema>;

// Salvar (insert se nao tem id, update se tem)
const user = userSchema.parse({ id: null, name: "Mauro", email: "m@b.com", createdAt: null, updatedAt: null });
await save("users", user);
// user.id agora tem o ObjectId gerado

// Buscar
const users = await findMany<User>("users", { name: "Mauro" });
const allUsers = await findMany<User>("users");

// Busca com pipeline
const admins = await findMany<User>("users", [
    { $match: { role: "admin" } },
    { $sort: { createdAt: -1 } },
    { $limit: 10 },
]);

// Busca paginada
const page = await findMany<User>("users", {}, { paginate: true, currentPage: 1, docsPerPage: 20 });
// page.docs, page.currentPage, page.pageQuantity, page.docsQuantity

// Deletar
await deleteMany("users", { email: "m@b.com" });

// Fechar
await close();
```

## O que adaptar na extracao

1. **Remover dotenv** — o usuario passa URI e dbName diretamente, nao via env vars
2. **Renomear exports** — `connectDB` → `connect`, `closeDB` → `close`, `getDB` → `getDb`
3. **Separar transforms** — extrair `_transformDoc`, `_transformDocForSave`, `_transformMatchQuery` para arquivo proprio
4. **Tipar melhor** — o `save` usa `any` em varias partes, melhorar tipagem
5. **Exportar schema e types** — `zodmongo/schema` como subpath export

## Testes

Usar **Vitest** com MongoDB real (mesmo approach do PodCubo):
- Sobe MongoDB local (ou usa docker-compose com mongo)
- Cada suite limpa a collection antes de rodar
- Testar todos os cenarios de save (insert, update, upsert)
- Testar findMany (match simples, pipeline, paginacao)
- Testar deleteMany
- Testar transformacoes id ↔ _id ↔ ObjectId (simples, aninhado, arrays)
- Testar schema validation com Zod
- Testar createdAt/updatedAt automaticos

## Site (VeloJS)

Site de documentacao usando VeloJS (build estatico):
- Landing page com exemplo de uso
- Getting started
- API reference (connect, save, findMany, deleteMany)
- Schemas (dbModelSchema, idSchema, como estender)
- Comparacao com Mongoose (por que usar ZodMongo)

## Steps de implementacao

1. Setup do projeto (package.json, tsconfig, vitest.config)
2. Copiar e adaptar `db.engine.ts` e `db.models.ts`
3. Separar em `engine.ts`, `schema.ts`, `transforms.ts`
4. Escrever testes
5. Escrever README com exemplos
6. Publicar no npm (`zodmongo`)
7. Adaptar PodCubo pra usar `zodmongo` como dependencia
8. Criar site com VeloJS
9. Registrar dominio `zodmongo.dev`

## Diferenciais vs concorrentes (Mongoose, zod-mongoose, etc.)

- **Sem Mongoose** — usa driver nativo do MongoDB, zero overhead
- **Zod nativo** — schemas definidos em Zod, nao em formato proprietario
- **TypeScript-first** — tipos inferidos direto do schema Zod
- **Leve** — ~200 linhas de codigo, sem dependencias alem de mongodb e zod
- **id/ObjectId transparente** — trabalha com `id` (string) na aplicacao, `_id` (ObjectId) no MongoDB
- **Timestamps automaticos** — `createdAt` e `updatedAt` gerenciados pelo ODM
- **Paginacao built-in** — via aggregation pipeline com $facet
- **Aggregation pipeline** — findMany aceita pipeline completo, nao apenas match
