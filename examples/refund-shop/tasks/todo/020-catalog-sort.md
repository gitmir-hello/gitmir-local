# Sort the catalog by price

Type: build
Touches: gm_6a29e42006

## Context

`listProducts` returns the catalog unordered.

## Task

Add a `sort=price` query parameter.

## Verify

1. `GET /api/products?sort=price` returns ascending by price.
2. No parameter keeps today's order.
