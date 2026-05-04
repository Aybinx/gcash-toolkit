# Security Specification

## Data Invariants
1. **Transaction Ownership**: Every transaction document must have a `uid` field that matches the `auth.uid` of the creator.
2. **Transaction Immutability**: Once created, transaction documents cannot be modified.
3. **Profile Privacy**: User profiles (containing balances) are strictly private. Only the owner can read or write their own profile.
4. **Account Integrity**: The profile balance must be a number.
5. **Temporal Integrity**: All write operations must include an `updatedAt` or `timestamp` field.

## The "Dirty Dozen" Payloads (Deny Cases)
1. **Identity Spoofing**: Attempting to create a transaction with someone else's `uid`.
2. **Transaction Hijacking**: Attempting to delete or read a transaction that belongs to another user.
3. **Balance Tampering**: Attempting to update another user's profile balance.
4. **Metadata Poisoning**: Attempting to inject extra fields (e.g., `role: 'admin'`) into a transaction or profile.
5. **Type Confusion**: Sending a string for the `balance` field.
6. **Negative Fees**: Creating a transaction with a negative fee.
7. **Orphaned Writes**: Creating a transaction without a required field like `amount`.
8. **Shadow Updates**: Attempting to update a transaction (Transactions are immutable).
9. **Global Read Attempt**: Attempting to list all profiles.
10. **ID Overlap**: Attempting to create a profile for a `userId` that doesn't match the `auth.uid`.
11. **Mass Deletion**: Attempting to delete all transactions in one go (without per-doc check).
12. **Future Dates**: Attempting to set a timestamp far in the future (though we use `is number` for simplicity currently).

## Conclusion
The following `firestore.rules` will implement strict Attribute-Based Access Control (ABAC) to prevent these attacks.
