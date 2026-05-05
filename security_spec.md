# Security Specification for Senior-Komi.AI

## Data Invariants
- A user document can only be read/written by the owner.
- Contacts, Reminders, Medications, and Logs belong to a specific user and are only accessible by that user.
- Timestamps (`createdAt`, `updatedAt`, `timestamp`) must be validated against `request.time`.
- `ownerId` must match the authenticated user's UID.
- All IDs must match a standard alphanumeric pattern.

## The "Dirty Dozen" Payloads (Examples to Block)
1. Creating a user document with someone else's UID.
2. Updating `ownerId` to hijack another user's data.
3. Injecting a 1MB string into the `name` field of a contact.
4. Setting `createdAt` to a future date from the client.
5. Deleting a contact that doesn't belong to you.
6. Listing all medication logs in the system without an owner filter.
7. Adding a contact with a 1.5KB string as the document ID.
8. Updating a medication frequency to a non-enum value (if restricted).
9. Creating a reminder with a negative priority.
10. Spoofing `email_verified` (rules will check `token.email_verified`).
11. Bypassing the `hasOnly` gate on updates by adding hidden fields.
12. Reading a user profile PII as an unauthenticated user.
