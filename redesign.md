# Stride Redesign Plan

## Status

- Direction: agreed
- Implementation: phases 1, 2, 3, 4, 5, 6, 7, 8, and 9 completed
- Current target: phase 9 complete
- Next focus: follow-up polish if needed

This document tracks the redesign direction and the remaining implementation phases. Use it as the source of truth for the redesign work that is still in progress.

## Product Thesis

Stride is an execution-first student productivity app. It should feel like a serious work system for turning messy obligations into planned, executed, and reviewed progress.

The design should make the core loop visible:

1. Capture tasks quickly.
2. Clarify what matters now.
3. Plan realistic focus time.
4. Execute in focused sessions.
5. Review what happened and adjust.

The app should not feel like a generic todo dashboard, a marketing page, or a collection of soft AI-generated cards.

## Final Direction

Stride should become a mostly professional execution console, with warmth only where it has meaning:

- Project identity
- Urgency
- Focus state
- Progress state

The default interface should be neutral, dense, structured, and tool-like.

## Non-Negotiables

- Density with clarity: more useful information per screen, but with stronger hierarchy.
- Product loop drives layout: capture, plan, focus, and review should shape navigation and page structure.
- Less decoration: remove most gradients, glows, oversized radii, and repeated card-on-card layouts.
- Sharper primitives: smaller radius, calmer borders, clearer selected states, better rows and panels.
- No placeholder feel: weak copy, placeholder sections, and generic "coming soon" surfaces should be removed or replaced.
- Real app behavior first: visual polish must support workflows, not hide them.

## Design Rules

1. Default UI is neutral, dense, and structured.
2. Project colors identify ownership/context, not decoration.
3. Primary accent color is used for action, selection, and current state.
4. Warning, success, and danger colors are reserved for real status.
5. Decorative gradients should be removed unless they communicate state.
6. Rows and panels replace most floating cards.
7. Rounded corners become tighter across the app.
8. Copy becomes concise and product-like, not explanatory.
9. Motion is functional only: fewer hover lifts, fewer soft shadows.
10. Compact mode should inform the default design spirit, not feel like a separate visual product.

## Visual Language

### Surfaces

- Use a neutral app canvas.
- Use panels for persistent work areas.
- Use rows for repeated data.
- Use cards only for true grouped objects, modals, or isolated tools.
- Avoid cards inside cards.

### Typography

- Reduce excessive negative tracking.
- Reduce uppercase metadata noise.
- Prefer concise labels over descriptive filler.
- Make numeric information easy to scan.

### Color

- Keep the base UI restrained.
- Use project colors for identity and ownership.
- Use accent color for current selection, primary action, and active state.
- Use semantic colors only for meaningful status.

### Shape And Shadow

- Tighten radii across primitives and repeated UI.
- Prefer borders and spacing over large shadows.
- Remove decorative glow treatments.
- Use stronger selected and focused states.

### Interaction

- Preserve keyboard-first workflows.
- Make active surfaces obvious.
- Keep toolbar actions stable and predictable.
- Reduce decorative hover movement.

## Screen Strategy

### Tasks

The `/tasks` route should become the main Today command center.

Focus areas:

- Crisp, aligned, scannable task rows.
- Clear Today, Upcoming, No Due Date, and Completed views.
- Toolbar-style filters and saved views.
- Selection mode that feels like a real batch editing mode.
- Metadata that is useful but not visually noisy.

### Projects

Projects should feel like active workspaces.

Focus areas:

- Project index as a clean project status surface.
- Stronger list/board mode distinction.
- Better project summary hierarchy.
- Clear status signals for overdue, planning coverage, next scheduled block, and members.

### Calendar

The calendar already has strong product behavior. Preserve the interaction model and tighten the presentation.

Focus areas:

- Cleaner planning grid.
- More confident scheduled block styling.
- Stronger selected day and current time indicators.
- Sidebar as planning context, not another card stack.
- Toolbar controls that feel like planner controls.

### Focus

Focus should be a session console, not a decorative hero.

Focus areas:

- Timer as the dominant instrument.
- Current block, next block, task context, project context.
- Daily progress and streak as supporting information.
- Minimal copy.
- No decorative hero glow treatment.

### Progress

Progress should feel analytical.

Focus areas:

- Weekly review as report/dashboard.
- Stronger information hierarchy.
- Fewer generic metric cards.
- Clear risk, execution, estimate, and momentum signals.

### Community

Community should not feel placeholder-like.

Focus areas:

- Make it a compact accountability surface.
- Keep weekly commitment and peer focus if useful.
- Remove or replace "coming soon" placeholder energy.

### Settings

Settings should be utilitarian and tidy.

Focus areas:

- Clear section grouping.
- Less card repetition.
- Better alignment of controls and explanations.

## Implementation Blueprint

### Phase 1: Foundation

- [x] Update global design tokens.
- [x] Tighten radius scale.
- [x] Rework borders, shadows, and surface classes.
- [x] Update shared primitives: page header, section container, metrics, empty states.
- [x] Update buttons, badges, inputs, selects, dialogs, sheets, popovers.
- [x] Confirm light and dark mode behavior.

### Phase 2: Shell

- [x] Redesign sidebar as command/navigation rail.
- [x] Improve active navigation states.
- [x] Reduce sidebar softness and visual clutter.
- [x] Improve project navigation hierarchy.
- [x] Improve mobile shell controls.
- [x] Review command palette styling.

### Phase 3: Tasks

- [x] Redesign task list container.
- [x] Redesign task row density and metadata.
- [x] Redesign view tabs and task toolbar.
- [x] Redesign saved view bar.
- [x] Redesign filter controls.
- [x] Redesign selection mode.
- [x] Verify Today, Upcoming, No Due Date, and Completed views.

### Phase 4: Task Detail And Quick Add

- [x] Redesign task detail panel as a structured editor.
- [x] Improve metadata alignment.
- [x] Improve dirty/save/delete states.
- [x] Redesign Quick Add as a capture tool.
- [x] Keep parser chips useful but quieter.
- [x] Verify mobile detail and quick add behavior.

### Phase 5: Projects

- [x] Redesign project index.
- [x] Redesign project summary rows.
- [x] Redesign project workspace header.
- [x] Redesign project list view.
- [x] Redesign project board view.
- [x] Verify drag and drop affordances.

### Phase 6: Calendar

- [x] Redesign planner toolbar.
- [x] Redesign planner filter bar.
- [x] Tighten planner grid lines and headers.
- [x] Redesign planned block styles.
- [x] Redesign all-day task area.
- [x] Redesign planner sidebar.
- [x] Verify day, week, and month views.

### Phase 7: Focus

- [x] Replace hero/card treatment with session console.
- [x] Redesign timer area.
- [x] Redesign current and next block context.
- [x] Redesign daily goal and session metrics.
- [x] Remove decorative glow treatments.

### Phase 8: Progress, Community, Settings

- [x] Redesign progress as weekly review dashboard.
- [x] Redesign slipped tasks and project momentum surfaces.
- [x] Redesign charts and chart containers.
- [x] Simplify community into accountability surface.
- [x] Remove placeholder sections.
- [x] Redesign settings sections and preference controls.

### Phase 9: QA

- [x] Desktop visual pass.
- [x] Mobile visual pass.
- [x] Dark mode pass.
- [x] Compact mode pass.
- [x] Text overflow pass.
- [x] Keyboard flow pass.
- [x] Loading and empty state pass.
- [x] Run lint.
- [x] Run typecheck.
- [x] Run build.

### Phase 9 Cleanup

- [x] Fixed the progress subject-balance copy encoding.
- [x] Fixed the reminder toast separator in the shell.
- [x] Tightened the mobile shell topbar so it blocks less of the viewport.
- [x] Increased the mobile content offset so page headers no longer sit under the shell.
- [x] Replaced the mobile top bar with corner-locked icons only.
- [x] Removed the extra mobile main padding that wasted space above the Today page.
- [x] Fixed the settings dialog on small screens by stacking it vertically, clamping its width to the viewport, and using a full-screen modal.
- [x] Removed the sidebar execution console subtitle.
- [x] Removed the duplicate Today page view filter strip so views live only in the sidebar.
- [x] Compacted the standalone Settings page by removing helper copy, tightening card density, and dropping the footer.
- [x] Aligned the sidebar label for `/progress` with the page title by renaming it from Review to Progress.
- [x] Shortened the projects header and collapsed the new-project button to an icon.
- [x] Compacted Quick Add into a smaller capture bar with optional details.
- [x] Kept Quick Add as a centered modal on all screen sizes.
- [x] Fixed the due date picker interaction and overflow behavior, including the mobile bottom-sheet variant.
- [x] Removed redundant helper copy from shared headers, settings, and task editors.
- [x] Reworked dark mode colors to a neutral black and graphite scale.
- [x] Removed task detail dead code and switched attachment thumbnails to optimized image rendering.

## Resolved Decisions

- User-selectable accent themes should remain, but the set should become more constrained and disciplined.
- Dense mode should become the default app experience.
- Separate compact/comfortable density modes should be removed for now.
- Community should remain a primary navigation item.
- Root navigation should emphasize the product loop explicitly: Today, Plan, Focus, Review, Projects, Community.

## Execution Rule

Do not start implementation from this document until the user explicitly says to execute the redesign work.
