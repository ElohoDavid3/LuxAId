# Markdown Rules

> **VERSION** : 1.0
> **UPDATED** : 2026-08-11
> **SCOPE** : project docs · agent rules · skill instructions · implementation notes · all `.md` artifacts
> **COMPANION** : `AGENTS.md`

---

## Purpose

Applies to every Markdown artifact in LuxAId:

| Artifact             | Location                     |
| -------------------- | ---------------------------- |
| Project docs         | `*.md` at repo root          |
| Agent/rule files     | `.agents/rules/*.md`         |
| Skill instructions   | `.agents/skills/*/SKILLS.md` |
| Implementation notes | anywhere                     |

---

## Structure

```
MUST   start with exactly one `# H1` heading.
MUST   use `##` for major sections, `###` for subsections.
MUST   keep headings descriptive and task-oriented.
MUST   keep paragraphs short.
MUST   prefer bullets and tables over sentences.
MUST   fence code blocks with an explicit language.
MUST   render in common Markdown viewers.
```

```markdown
# Document Title

## Section

### Subsection
```

---

## Requirements Documents

Requirements MUST state:

| Field               | Required        |
| ------------------- | --------------- |
| Purpose             | YES             |
| Scope               | YES             |
| Requirements        | YES             |
| Constraints         | YES             |
| Acceptance criteria | when applicable |
| Failure behavior    | when applicable |

`MUST NOT` turn implementation details into requirements unless the product actually requires them.

---

## Agent / Rule Documents

Rules MUST be:

```
- direct
- testable
- unambiguous
- actionable
```

Use the authority words instead of vague language:

| Word       | Meaning                                       |
| ---------- | --------------------------------------------- |
| `MUST`     | mandatory                                     |
| `MUST NOT` | forbidden                                     |
| `SHOULD`   | recommended; deviation requires justification |
| `MAY`      | optional                                      |

---

## Code Examples

```
MUST    keep examples minimal and production-relevant.
MUST NOT include real secrets, tokens, private keys, customer data, or credentials.
MUST    use placeholders such as `process.env.FLW_SECRET_KEY`.
MUST    align provider-specific examples with current official documentation.
```

---

## Editing

```
MUST    preserve existing requirements unless explicitly superseded.
MUST NOT remove constraints merely to simplify a document.
MUST    record ambiguity rather than inventing a resolution.
SHOULD  not duplicate rules across files unless duplication materially improves discoverability.
```
