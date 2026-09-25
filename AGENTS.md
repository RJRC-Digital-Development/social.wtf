# Project Interaction Instructions

## `(.)` Continuity Logic

When the owner sends a message consisting only of:

`.`

interpret it as:

**“Resume exactly where we left off and continue the current operation.”**

It normally means the conversation/tool connection was interrupted or the owner needs to trigger continuation.

Rules:

1. Do NOT treat `.` as a new task.
2. Do NOT reset project context.
3. Do NOT ask “What would you like to do?”
4. Do NOT restart completed work.
5. Do NOT reinterpret the project's requirements.
6. Resume from the most recent unfinished step.
7. Preserve all current constraints, security boundaries, accepted decisions, and stop conditions.
8. If the previous operation was waiting for a tool/result, continue from that point.
9. If the previous instruction required producing an artifact/report, continue producing that artifact/report.
10. If the previous task was already completely finished, briefly report that it is complete and identify the next pending step rather than inventing new work.
11. A slash-like accidental one-character continuation input may be treated the same way when context clearly indicates an interrupted session.
12. This convention applies only to owner interaction/control flow. Never interpret `.` specially when it occurs inside source code, configuration, paths, commands, user data, or other technical content.

For the current session specifically, if the owner sends `.` next, continue the responsive dashboard review-artifact task from the last unfinished step unless a newer explicit instruction supersedes it.
