---
trigger: always_on
---

# Tax and accounting domain guardrails

This project handles exam content, grading, and review for tax law and accounting topics.

## Domain priorities

- Check legal/accounting terminology carefully.
- Treat timing, classification, exceptions, and thresholds as critical.
- Watch for edge cases involving filing deadlines, penalties, recognition timing, deductible vs non-deductible items, taxable vs non-taxable items, and entity-specific rules.

## Output requirements

- When reviewing logic, explicitly list domain assumptions.
- When uncertain about a domain rule, mark it as "needs legal/accounting verification".
- Do not silently simplify tax/accounting logic if that changes grading meaning.

## Grading-specific checks

- Distinguish between correct conclusion and correct reasoning.
- Flag partial-credit opportunities where applicable.
- Separate factual extraction, legal/accounting reasoning, and final scoring.
