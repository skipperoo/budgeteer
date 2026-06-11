# Budgeteer

## Register

product

## Users

Two equally important user groups:

- **Individuals** managing their own finances. They open Budgeteer daily or weekly to log transactions, review spending by category, and check account balances. They chose Budgeteer for its privacy guarantees — they want a tool, not a platform that monetizes their data.
- **Couples and households** sharing joint accounts. They need a shared view of household spending and income, with cryptographic guarantees that their financial data is never accessible to the server. Trust is the feature: each member's private key is theirs alone.

Both groups share the same context: they're doing something emotionally loaded (tracking money) and want the tool to be precise, predictable, and calm. They are not "gamifying savings" or chasing goals — they want an accurate ledger they control.

## Product Purpose

Budgeteer is a collaborative, offline-first personal finance tracker with end-to-end encryption. Every financial datum — amount, category, notes, counterparty — is encrypted before it leaves the client. The server routes by metadata and stores ciphertext. Users own their data: the private key is derived from their password, decrypted in-memory per session, and never persisted.

The product exists because existing finance trackers (Mint, YNAB, etc.) either read your bank data via Plaid/OAuth or store your plain-text transactions on their servers. Budgeteer's core premise is that financial privacy is not a premium feature — it's the default.

## Brand Personality

Private, precise, calm. The brand leans toward *private/precise/calm* over *modern/sharp/confident* — though the execution is modern, it's a quiet modern. Think a well-organized ledger brought into 2026: generous whitespace, deliberate typography, muted neutrals, and a single accent that never shouts. The interface says "I have your numbers correct" — not "look at me."

Three words that don't appear in the brand vocabulary: playful, urgent, trendy.

## Anti-references

None specified by the team. The designer should use their judgment to avoid category clichés — the green/gray Mint aesthetic, the dark navy/gold wealth-management look, and the pastel neobank (Robinhood) style are all adjacent traps to be conscious of without overcorrecting.

## Design Principles

### 1. Privacy is the product, not a badge
E2E encryption is Budgeteer's reason for being. The UI should never make the user feel like encryption is getting in their way, but it should also never pretend it isn't there. Where the encrypted nature is relevant (inviting a user, logging in on a new device, seeing that a transaction is "decrypting"), communicate clearly and without ceremony. No lock icons everywhere. No "secure" labels. The absence of friction IS the signal.

### 2. Calm confidence in every interaction
Finances are stressful for most people. The interface should feel like a trustworthy accountant's desk — orderly, predictable, and never surprising. Motion is subtle and purposeful (ease-out, no bounce). Error messages are specific and actionable, never alarming. Loading states are skeleton placeholders, not spinners. The default state is showing data, not asking for it.

### 3. Precision over decoration
Typography, spacing, and alignment carry the hierarchy. Decorative elements (gradients, illustrations, heavy borders) are noise unless they serve comprehension. Every element earns its place. The color palette is restrained — one neutral family and one accent. Data (numbers, dates, categories) is always the most visually prominent thing on screen.

### 4. Offline-first without ceremony
The app works when the network doesn't. Sync is invisible: operations are committed locally, queued, and synced when connectivity returns. The UI never shows a "you're offline" banner that blocks interaction. A subtle indicator in the status area is sufficient. Conflict resolution (LWW with immutable transactions) is designed into the data model so the user never sees a merge conflict.

### 5. Shared but private
Joint accounts are a first-class feature, but every member's private key is theirs alone. The account key is shared cryptographically — the UI for inviting and managing members should feel as straightforward as a shared household ledger, while the crypto happens underneath. Members see the same decrypted data; the UI never exposes whose key is being used.

## Accessibility & Inclusion

WCAG 2.1 AA is the baseline. Standard contrast ratios, keyboard navigation, and visible focus indicators. Color is used as an enhancement (green/red for income/expense) but never as the sole differentiator — icons or labels accompany color-coded signals. The app respects `prefers-reduced-motion` and provides reduced-animation alternatives.
