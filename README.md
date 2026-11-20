# SalonBook API

Express API for the SalonBook salon appointment booking platform.

## Database design

SalonBook uses MongoDB with the official MongoDB Node.js driver.

| Collection | Purpose | Main fields |
| --- | --- | --- |
| users | Customer and admin profiles managed through Better Auth | name, email, image, role, isBlocked |
| services | Services offered by the salon | serviceName, category, description, price, duration, image, status, createdAt |
| appointments | Customer booking requests | serviceId, customerId, appointmentDate, timeSlot, message, servicePrice, paymentStatus, status, createdAt |
| transactions | Stripe payment records | appointmentId, customerId, amount, currency, stripeSessionId, status, createdAt |

## Relationships and rules

- Each appointment references one service and one customer.
- Each transaction references one appointment and one customer.
- An appointment stores the service price at booking time so later price changes do not change that booking.
- A new appointment starts as pending and unpaid.
- A pending or confirmed appointment reserves its date and time slot. A cancelled appointment releases the slot.
- A verified Stripe webhook records a successful payment. Processing the same checkout session again must not create a duplicate transaction.
- Better Auth manages its supporting authentication collections.