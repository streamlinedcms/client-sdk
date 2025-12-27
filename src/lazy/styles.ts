/**
 * Editor Styles - CSS injection for edit mode
 *
 * Injects styles for:
 * - Editable element highlighting (hover, selected, editing states)
 * - Template instance controls (delete button, drag handle)
 * - Template add button
 * - Structure mismatch indicator
 * - SortableJS drag-and-drop classes
 */

const STYLE_ID = "streamlined-cms-styles";

/**
 * Inject edit mode styles into the document head.
 * Idempotent - will not inject styles if already present.
 */
export function injectEditStyles(): void {
    if (document.getElementById(STYLE_ID)) {
        return;
    }

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
        .streamlined-editable {
            outline: 2px dashed transparent;
            outline-offset: -2px;
            transition: outline 0.2s;
            cursor: pointer;
            position: relative;
        }

        .streamlined-editable:hover {
            outline-color: #ef4444;
        }

        .streamlined-editable:empty::before {
            content: "Click to edit";
            color: #9ca3af;
            font-style: italic;
        }

        .streamlined-selected {
            outline: 2px solid #ef4444;
            outline-offset: -2px;
        }

        .streamlined-selected-sibling {
            outline: 2px solid #fca5a5;
            outline-offset: -2px;
        }

        .streamlined-editing {
            outline: 2px solid #ef4444;
            outline-offset: -2px;
        }

        .streamlined-editing-sibling {
            outline: 2px solid #fca5a5;
            outline-offset: -2px;
        }

        /* Template instance controls */
        .scms-instance-delete {
            position: absolute;
            top: 4px;
            right: 4px;
            width: 28px;
            height: 28px;
            border-radius: 50%;
            background: rgba(0, 0, 0, 0.4);
            color: white;
            border: none;
            font-size: 18px;
            line-height: 1;
            cursor: pointer;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.2s, background 0.2s;
            z-index: 10;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .scms-instance-delete:hover {
            background: rgba(0, 0, 0, 0.6);
        }

        /* Desktop: show on hover */
        @media (hover: hover) {
            [data-scms-instance]:hover > .scms-instance-delete {
                opacity: 1;
                pointer-events: auto;
            }
        }

        /* Touch devices: show when instance is selected */
        @media (hover: none) {
            [data-scms-instance].scms-instance-selected > .scms-instance-delete {
                opacity: 1;
                pointer-events: auto;
            }
        }

        /* Template structure mismatch indicator */
        [data-scms-structure-mismatch] {
            outline: 2px dashed #f97316 !important;
            outline-offset: -2px;
            position: relative;
        }

        [data-scms-structure-mismatch]::after {
            content: "⚠";
            position: absolute;
            bottom: 4px;
            left: 4px;
            width: 20px;
            height: 20px;
            background: #f97316;
            color: white;
            border-radius: 50%;
            font-size: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10;
        }

        /* Template add button */
        .scms-template-add {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            width: 100%;
            padding: 12px;
            margin-top: 8px;
            border: 2px dashed #d1d5db;
            border-radius: 8px;
            background: transparent;
            color: #6b7280;
            font-size: 14px;
            cursor: pointer;
            transition: all 0.2s;
        }

        .scms-template-add:hover {
            border-color: #ef4444;
            color: #ef4444;
            background: #fef2f2;
        }

        .scms-template-add svg {
            width: 16px;
            height: 16px;
        }

        /* Drag handle for reordering */
        .scms-instance-drag-handle {
            position: absolute;
            top: 4px;
            left: 4px;
            width: 24px;
            height: 24px;
            border-radius: 4px;
            background: transparent;
            color: rgba(0, 0, 0, 0.4);
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: grab;
            opacity: 0;
            transition: opacity 0.2s, background 0.2s, color 0.2s;
            z-index: 10;
        }

        .scms-instance-drag-handle:hover {
            background: rgba(0, 0, 0, 0.1);
            color: rgba(0, 0, 0, 0.6);
        }

        .scms-instance-drag-handle:active {
            cursor: grabbing;
        }

        /* Desktop: show on hover */
        @media (hover: hover) {
            [data-scms-instance]:hover > .scms-instance-drag-handle {
                opacity: 1;
            }
        }

        /* Touch devices: show when instance is selected */
        @media (hover: none) {
            [data-scms-instance].scms-instance-selected > .scms-instance-drag-handle {
                opacity: 1;
            }
        }

        .scms-instance-drag-handle svg {
            width: 16px;
            height: 16px;
        }

        /* SortableJS classes */
        .scms-sortable-ghost {
            opacity: 0.4;
        }

        .scms-sortable-chosen {
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }

        .scms-sortable-drag {
            opacity: 1;
        }
    `;
    document.head.appendChild(style);
}
