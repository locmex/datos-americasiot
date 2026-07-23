# Product Catalog Specification

## Purpose

Defines admin management of the product catalog and client read access to it. Products are the sellable items clients reference when creating orders.

## Requirements

### Requirement: Admin Product Creation

The system MUST allow an authenticated admin to create a new product. The system MUST reject creation when `name` is missing/empty or `price` is missing, non-numeric, or ≤ 0.

#### Scenario: Admin creates a valid product

- GIVEN an authenticated admin session
- WHEN the admin submits a product with a non-empty `name` and `price` > 0
- THEN the system creates the product and returns it with status `active`

#### Scenario: Missing required field

- GIVEN an authenticated admin session
- WHEN the admin submits a product with empty `name` or without `price`
- THEN the system MUST reject the request with a validation error and MUST NOT create the product

#### Scenario: Invalid price

- GIVEN an authenticated admin session
- WHEN the admin submits `price` ≤ 0 or non-numeric
- THEN the system MUST reject the request with a validation error

### Requirement: Admin Product Edit

The system MUST allow an admin to edit an existing product's fields (name, price, description, etc.), subject to the same validation rules as creation.

#### Scenario: Admin updates a product

- GIVEN an existing product and an authenticated admin session
- WHEN the admin submits valid updated fields
- THEN the system persists the changes and returns the updated product

#### Scenario: Edit with invalid data

- GIVEN an existing product and an authenticated admin session
- WHEN the admin submits an empty `name` or invalid `price`
- THEN the system MUST reject the update and leave the product unchanged

### Requirement: Admin Activate/Deactivate Product

The system MUST allow an admin to toggle a product's status between `active` and `inactive`. Inactive products MUST remain in the catalog for historical order references but MUST NOT appear in the client-facing catalog.

#### Scenario: Admin deactivates a product

- GIVEN an active product and an authenticated admin session
- WHEN the admin deactivates it
- THEN the product's status becomes `inactive`
- AND the product no longer appears in the client catalog listing

#### Scenario: Admin reactivates a product

- GIVEN an inactive product and an authenticated admin session
- WHEN the admin activates it
- THEN the product's status becomes `active` and it reappears in the client catalog

### Requirement: Admin Product Deletion

The system MUST allow an admin to delete a product that has never been referenced by any order. The system MUST NOT allow deletion of a product referenced by at least one order; deactivation MUST be used instead.

#### Scenario: Delete unreferenced product

- GIVEN a product with no associated order items
- WHEN the admin deletes it
- THEN the product is removed from the catalog

#### Scenario: Attempt to delete referenced product

- GIVEN a product referenced by at least one existing order
- WHEN the admin attempts to delete it
- THEN the system MUST reject the deletion with an error indicating the product is in use

### Requirement: Client Catalog Read Access

The system MUST allow any authenticated client to list products. The listing MUST include only products with status `active`.

#### Scenario: Client lists catalog

- GIVEN an authenticated client session and a mix of active and inactive products
- WHEN the client requests the catalog
- THEN the system returns only `active` products

### Requirement: Catalog Management Authorization

The system MUST restrict product creation, edit, activation/deactivation, and deletion to sessions with `role == "admin"`. The system MUST reject these operations with a 403 when performed by a client session.

#### Scenario: Client attempts to manage catalog

- GIVEN an authenticated client session
- WHEN the client calls a product creation, edit, status-toggle, or delete endpoint
- THEN the system responds with 403 and performs no change
