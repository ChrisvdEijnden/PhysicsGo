# Data processing in PhysicsGo

A one-page description for schools (for the data processing agreement, *verwerkersovereenkomst*, and the school's register of processing). Students and teachers see the same information in plain language in the app's privacy statement (`#/privacy`, source `src/data/privacy.ts`).

## Roles

- **Controller** (*verwerkingsverantwoordelijke*): the school that uses PhysicsGo.
- **Processor** (*verwerker*): whoever installs and runs PhysicsGo for the school. There are no sub-processors: PhysicsGo runs on one server with its own database and file storage, and the app loads nothing from other services (fonts and code are served by PhysicsGo itself).

## Purpose

Physics modelling lessons: students sign in, work on assignments and hand them in; teachers give assignments to their classes, follow progress and review hand-ins. Data is not used for anything else, not shared, and not used for analytics, advertising or profiling.

## Data subjects and data

| Who | Data | Where (server/db.js) |
| --- | --- | --- |
| Students and teachers | Name, email address, role, school, password hash (argon2id), account created, last active, administrator flag, deactivated | `users`, `schools` |
| Students and teachers | Class memberships and when they started; teachers' invitations of colleagues (email address) | `class_students`, `class_teachers`, `class_teacher_invites` |
| Students (and teachers trying assignments) | Saved work: start values, model rules, graphs, measured points | `project_work` |
| Students | Handed-in copies of their work, with the time | `submissions` |
| Students and teachers | Photos and videos added to assignments | files under `PHYSICSGO_MEDIA_DIR`, listed in `media_files` |
| Teachers | Assignments they wrote, due dates and instructions per class | `projects`, `project_classes` |
| Students and teachers | Signed-in browsers: token hash, created, last used, browser description (user agent) | `sessions` |
| Students and teachers | Password reset codes (hash only), who made them | `password_resets` |

No special categories of personal data are processed. Most users are minors; the school decides who gets an account (students need a class code from their teacher, teachers an invitation).

## Who has access

- The user themselves.
- Teachers: the students in their own classes (name, email, work, hand-ins for assignments in those classes).
- Administrators (set by the processor or school): account details of all users, to manage access. Administrators don't see work through the app.
- The processor's system administrators, for operation and backups.

## Retention

| Data | Kept |
| --- | --- |
| Sessions | at most 7 days; ended after 8 hours without use (`SESSION_IDLE_HOURS`); expired ones removed hourly |
| Password reset codes | 24 hours |
| Deleted classes | restorable for 30 days, then removed with their memberships |
| Accounts | deleted after 2 years without use (`ACCOUNT_RETENTION_DAYS`), with their work, hand-ins and files; kept only for administrators and for teachers who are still the only teacher of a class |
| Deleted accounts | removed immediately, with work, hand-ins, uploaded files and unpublished assignments |
| Backups | 14 daily copies of the database (see docs/deployment.md) |

## Rights of data subjects

- Access and portability: *Settings → Download my data* gives a JSON file with everything stored about the user (uploaded files are listed and can be downloaded from the assignments).
- Rectification: name and email address on the profile page.
- Erasure: *Settings → Delete account*; teachers can delete a student's account from their class; administrators can delete any account.
- Other requests go to the school, which can ask an administrator to act.

## Security measures

- Passwords hashed with argon2id; session tokens and reset codes stored only as SHA-256 hashes.
- Session cookie `HttpOnly`, `SameSite=Lax`, and `Secure` in production; HTTPS required in production (see docs/deployment.md).
- Rate limits on sign-in, registration, codes and password changes; codes avoid easily confused characters and are single-purpose.
- Security headers (helmet), JSON-only API with size limits, uploads checked by type and limited per account.
- Every access check is done on the server; students only see assignments published to their classes, teachers only their own classes.
- Deactivating an account signs it out everywhere at once.

## Incidents

The processor informs the school without delay after discovering a breach of personal data, so the school can decide on reporting it to the Autoriteit Persoonsgegevens within 72 hours and informing those involved.
