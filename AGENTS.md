# PocketPaths — Project Instructions

## Product

PocketPaths transforms confusing instructions into editable, connected information cards and manageable action steps.

Primary audience: students. Design for a broader range of attention, memory, reading, sensory and accessibility needs.

## Stack

- React
- TypeScript with strict type checking
- Vite
- Tailwind CSS v4
- Lucide React
- Browser localStorage for persistence
- Vitest and React Testing Library for critical tests

## Product principles

- Calm, polished, responsive and accessible interface.
- Clear hierarchy, generous spacing and readable typography.
- Keyboard accessible controls and visible focus states.
- Respect reduced-motion preferences.
- Never rely on color or icons alone to convey meaning.
- Every important action should have visible feedback.
- Allow users to edit and correct generated information.
- Do not make medical or diagnostic claims.
- Core functionality must work without an AI API key.

## Engineering constraints

- Use reusable components and typed domain models.
- Keep business logic separate from presentation.
- Use stable IDs for cards and relationships.
- Validate persisted state before loading it.
- Autosave safely and handle corrupted localStorage data.
- Avoid unnecessary dependencies and premature abstraction.
- Do not introduce authentication, a backend, cloud sync or analytics for the MVP.
- Do not add placeholder buttons that appear functional but do nothing.
- Never overwrite unrelated user changes during an undo operation.

## Development workflow

- Inspect the current code before making changes.
- Implement one milestone at a time.
- Explain the files to be changed before large refactors.
- Run type checking, tests and a production build after meaningful changes.
- Fix regressions before adding features.
- Do not claim a feature works unless it has been verified.

## Definition of done

The app can create a path, edit and connect cards, switch between views, use Focus mode, preserve progress across refreshes, change accessibility settings, and demonstrate a reliable recovery interaction.
