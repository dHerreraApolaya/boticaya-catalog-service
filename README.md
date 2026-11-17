# Botica Ya API

Independent backend repository. Initial scope: catalog service (`GET /api/products`).

## Requirements

Java 21 and the included Maven Wrapper. Framework and wrapper versions are inherited from the original implementation and must pass dependency resolution before deployment.

## Configuration

Set `SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME`, and `SPRING_DATASOURCE_PASSWORD` in the server environment. `PORT` defaults to 8081. `.env.example` documents variable names; Spring Boot does not automatically load `.env` files.

For Supabase, obtain the PostgreSQL JDBC connection settings from the project dashboard, use the appropriate direct or pooler endpoint, and enforce TLS according to the database connection configuration. Never place database credentials in frontend `VITE_*` variables.

## Commands

```sh
sh mvnw verify
sh mvnw spring-boot:run
```

The existing context test needs a reachable test PostgreSQL database with environment variables supplied. Do not point tests at production. `sql/catalogo-prueba.sql` is a manual development seed containing one product, not a migration runner. Tests currently do not establish endpoint coverage or the 80% quality target.

## Repository boundaries

Frontend: https://github.com/dHerreraApolaya/web-botica-ya

Frontend mocks remain independent. No HTTP integration, authentication, payment processing, or database changes are introduced by this extraction. Add catalog contracts, repository boundaries, database migrations, isolated tests, and backend CI in subsequent scoped changes.

## Provenance

Extracted from frontend commit `6a8c2558eda8ecd3528e4d23a44fd2bf69ad206c`, the sole commit modifying the API directory at extraction. The extraction commit retains the original author. Datasource credentials were replaced before creating this repository history; original credential-bearing blobs are not imported. The original frontend history is unchanged.
