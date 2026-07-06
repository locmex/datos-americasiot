# Order Management Specification

## Purpose

Defines order creation by clients, state transitions and tracking managed by admins, and access boundaries between client and admin sessions. Every state change MUST be auditable.

## Requirements

### Requirement: Order Creation

The system MUST allow an authenticated client to create an order containing one or more items, each referencing an active product and a quantity > 0. The system MUST reject orders with zero items or any item with quantity ≤ 0. A newly created order MUST start in status `pending`.

#### Scenario: Client creates a valid order

- GIVEN an authenticated client session and at least one active product
- WHEN the client submits an order with 1+ items, each with quantity > 0
- THEN the system creates the order in status `pending` and MUST create an initial history entry for `pending`

#### Scenario: Empty order rejected

- GIVEN an authenticated client session
- WHEN the client submits an order with zero items
- THEN the system MUST reject the request and MUST NOT create an order

#### Scenario: Invalid quantity rejected

- GIVEN an authenticated client session
- WHEN the client submits an item with quantity ≤ 0
- THEN the system MUST reject the entire order and MUST NOT create it

### Requirement: Allowed State Transitions

Order status MUST progress only through these transitions: `pending → preparing` (admin only), `preparing → shipped` (admin only, requires carrier and tracking number), `shipped → delivered` (client only, own order), and cancellation via `pending → cancelled` or `preparing → cancelled` (admin or the owning client). The system MUST reject any transition not in this list, including skipping states (e.g. `pending → delivered`) or transitioning from a terminal status (`delivered`, `cancelled`).

#### Scenario: Admin advances pending to preparing

- GIVEN an order in status `pending` and an authenticated admin session
- WHEN the admin sets status to `preparing`
- THEN the order status becomes `preparing`
- AND a history entry recording the transition is created

#### Scenario: Admin ships order with tracking

- GIVEN an order in status `preparing` and an authenticated admin session
- WHEN the admin sets status to `shipped` supplying `carrier` and `tracking_number`
- THEN the order status becomes `shipped` and the tracking fields are stored
- AND a history entry is created

#### Scenario: Ship without tracking data rejected

- GIVEN an order in status `preparing` and an authenticated admin session
- WHEN the admin attempts to set status to `shipped` without `carrier` or `tracking_number`
- THEN the system MUST reject the transition and the order MUST remain in `preparing`

#### Scenario: Client confirms delivery

- GIVEN an order in status `shipped`, owned by the requesting client
- WHEN the client marks it `delivered`
- THEN the order status becomes `delivered`
- AND a history entry is created

#### Scenario: Cancellation before shipping

- GIVEN an order in status `pending` or `preparing`, and either its owning client or an admin session
- WHEN cancellation is requested
- THEN the order status becomes `cancelled`
- AND a history entry is created

#### Scenario: Invalid transition rejected

- GIVEN an order in status `pending`
- WHEN any actor attempts to set status directly to `delivered`, or to `cancelled` once the order is already `shipped`, `delivered`, or `cancelled`
- THEN the system MUST reject the transition with an error and MUST NOT alter the order status

### Requirement: State Change History

Every successful status transition MUST create exactly one history record capturing the previous status, new status, actor, and timestamp.

#### Scenario: History accumulates across the order lifecycle

- GIVEN an order that moves `pending → preparing → shipped → delivered`
- WHEN each transition succeeds
- THEN the order's history contains one entry per transition, in chronological order

### Requirement: Order Visibility Scope

The system MUST allow an admin to list and view all orders regardless of owner. The system MUST allow a client to list and view only orders they own. The system MUST respond with 403 or 404 when a client requests an order they do not own.

#### Scenario: Admin lists all orders

- GIVEN orders belonging to multiple clients and an authenticated admin session
- WHEN the admin requests the order list
- THEN the system returns all orders

#### Scenario: Client lists own orders only

- GIVEN orders belonging to multiple clients and an authenticated client session
- WHEN the client requests the order list
- THEN the system returns only orders owned by that client

#### Scenario: Client accesses another client's order

- GIVEN an order owned by client A
- WHEN client B requests that order directly by id
- THEN the system MUST respond with 403 or 404 and MUST NOT return the order data

### Requirement: Admin-Only Route Authorization

The system MUST restrict order-management admin operations (listing all orders, changing status, setting tracking) to sessions with `role == "admin"`, rejecting client sessions with 403.

#### Scenario: Client calls an admin order route

- GIVEN an authenticated client session
- WHEN the client calls an admin-only order endpoint (e.g. list all orders, change status)
- THEN the system responds with 403 and performs no change
