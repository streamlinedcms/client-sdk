/**
 * UndoManager - Generic undo/redo stack manager
 *
 * Implements the command pattern with dual stacks. Knows nothing about
 * templates, content, or DOM — just holds UndoableAction objects.
 *
 * - push() adds to undo stack, clears redo stack
 * - undo() pops from undo → calls action.undo() → pushes to redo
 * - redo() pops from redo → calls action.redo() → pushes to undo
 */

import type { Logger } from "loganite";

export interface UndoableAction {
    type: string;
    description: string;
    timestamp: number;
    undo(): void;
    redo(): void;
}

export class UndoManager {
    private undoStack: UndoableAction[] = [];
    private redoStack: UndoableAction[] = [];

    constructor(
        private log: Logger,
        private onStateChange: () => void,
    ) {}

    get canUndo(): boolean {
        return this.undoStack.length > 0;
    }

    get canRedo(): boolean {
        return this.redoStack.length > 0;
    }

    push(action: UndoableAction): void {
        this.undoStack.push(action);
        this.redoStack.length = 0;
        this.log.debug("Action pushed to undo stack", {
            type: action.type,
            description: action.description,
            undoDepth: this.undoStack.length,
        });
        this.onStateChange();
    }

    undo(): void {
        const action = this.undoStack.pop();
        if (!action) return;

        this.log.debug("Undoing action", { type: action.type, description: action.description });
        action.undo();
        this.redoStack.push(action);
        this.onStateChange();
    }

    redo(): void {
        const action = this.redoStack.pop();
        if (!action) return;

        this.log.debug("Redoing action", { type: action.type, description: action.description });
        action.redo();
        this.undoStack.push(action);
        this.onStateChange();
    }

    clear(): void {
        this.undoStack.length = 0;
        this.redoStack.length = 0;
        this.onStateChange();
    }
}
