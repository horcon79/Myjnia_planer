# Tablet and mobile interaction

The planner supports a narrow view of one employee without changing the shift roster or order assignments. Select **Widok pracowników** to switch between the full shift and one employee. The timetable scrolls within its own container, with the time column and employee headings kept visible.

On touch screens, swipe the timetable or an order card to scroll. Tap a card or its details button to open scheduling. Short and overlapping cards have a compact touch view with a large status action. Mouse users can still hold a card and drag it to another slot; moving an order requires confirmation.

Phone and tablet navigation uses a separate row below the brand and profile. The full inline menu starts at 1536 CSS pixels. The order form stacks above the order list below 1280 CSS pixels. Touch controls have a minimum 44-pixel target, editable fields use 16-pixel text, and browser zoom remains enabled.

## Verification

Validated with a local, seeded SQLite database and Chromium browser emulation:

- Planner, orders, summary, reports and settings: no document-level horizontal overflow at 390×844, 768×1024, 1024×768, 1280×800 and 1440×900.
- Employee filtering and touch opening/closing of scheduling: checked at all four touch sizes above.
- Scheduling dialog stays within the viewport at those touch sizes.
- After the final navigation adjustment: planner checked again at 1280×800 and 1536×900.
- A touch swipe starting on a card scrolls the timetable.
- Production build and TypeScript checks pass.
- Existing lint violations remain in the project. Comparing changed files with the base revision shows no added errors; the unused navigation effect/imports were removed.

Before rollout, check on the actual workshop tablet (including Safari if using iPad): open the on-screen keyboard in a scheduling form, rotate the device, move an order and confirm it, progress a test order through Start / Gotowe / Wydane, and verify the chat in standalone mode. Browser emulation does not validate physical-device keyboard or safe-area behavior.
