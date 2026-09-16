'use client';
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

/** One shortcut row: the keys, and what they do. */
const shortcuts: [string, string][] = [
  ['Arrow keys', 'Move the selection one inch'],
  ['Shift + arrows', 'Move the selection six inches'],
  ['R', 'Turn 90°'],
  ['Shift + R', 'Turn 180°'],
  ['Delete or Backspace', 'Remove the selection'],
  ['Tab, then Enter', 'Step through items in the plan and select one'],
  ['Shift + click', 'Add an item to the selection, or take it out again'],
  ['Shift + drag', 'Sweep a band over several items in the plan'],
  ['Space + drag', 'Pan the plan, including over cabinets'],
  ['Escape', 'Leave presentation mode, the enlarged canvas, or this guide'],
  ['?', 'Open this guide'],
];

/**
 * The how-to overlay, opened from Help in the header.
 *
 * A native modal dialog rather than a hand-rolled overlay: the browser
 * supplies the backdrop, the focus trap and Escape, and the designer's own
 * stylesheet dresses it like the rest of the workspace.
 */
export function HelpGuide({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);
  return (
    <dialog
      ref={dialog}
      className="help-guide"
      aria-labelledby="help-guide-title"
      // Escape and the close button both arrive here, so the button that
      // opened the guide always ends up in the right state.
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialog.current) onClose();
      }}
    >
      <div className="help-guide-head">
        <h2 id="help-guide-title">How to use Kitchen Studio</h2>
        <button aria-label="Close help" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <div className="help-guide-body">
        <section>
          <h3>Work through the five stages</h3>
          <p>
            <strong>Room</strong> measures the space and places doors, windows
            and services. <strong>Cabinets</strong> opens the library.{' '}
            <strong>Design</strong> is where you arrange everything,{' '}
            <strong>Quote</strong> prices it, and <strong>Present</strong>{' '}
            produces drawings and client packages. You can move between stages
            in any order; the design stays open.
          </p>
          <p>
            New to it? Use <strong>Choose a sample kitchen</strong> under
            Examples &amp; presentation tools to start from a finished room
            instead of an empty one.
          </p>
        </section>
        <section>
          <h3>Add items</h3>
          <p>
            Drag a card from the library into the plan, or select it and use
            Add. While you drag, a green footprint means the spot is clear and a
            red one means something is in the way - the message above the
            workspace says what. Doors and windows need a straight wall to
            attach to.
          </p>
          <p>
            A catalog item whose width, depth or height is still unknown cannot
            be placed. That is deliberate: the record has not been verified
            against the manufacturer&apos;s book yet.
          </p>
        </section>
        <section>
          <h3>Select and move</h3>
          <p>
            Click an item to select it and drag it to move it. Snapping to walls
            and neighbouring items is on by default - turn off{' '}
            <strong>Snap to walls &amp; items</strong> below the canvas for free
            placement.
          </p>
          <p>
            For several at once, <strong>Shift + click</strong> each item, or
            hold <strong>Shift</strong> and drag a band across empty floor to
            sweep up everything it touches. Dragging any member then moves the
            whole group, and the arrow keys, R and Delete apply to all of it. A
            turn rotates the group about its own centre, so a run of cabinets
            stays a run. Click empty floor to clear the selection, or click one
            member to reduce the selection to it.
          </p>
          <p>
            Parts that belong together travel together: a countertop with its
            cabinet, a sink with the surface it sits in, the rest of an
            assembly. Turn off <strong>Move entire assembly</strong> in
            Properties to adjust one piece on its own.
          </p>
        </section>
        <section>
          <h3>Keyboard</h3>
          <table className="help-guide-keys">
            <tbody>
              {shortcuts.map(([keys, meaning]) => (
                <tr key={keys}>
                  <th scope="row">
                    <kbd>{keys}</kbd>
                  </th>
                  <td>{meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            These work in the <strong>2D plan</strong> and the{' '}
            <strong>Render</strong> view, so arrow keys still scroll the page
            everywhere else. The Render view starts with{' '}
            <strong>Items locked</strong> so orbiting cannot move a design;
            unlock it there before dragging or using the keys.
          </p>
        </section>
        <section>
          <h3>The views</h3>
          <p>
            <strong>2D plan</strong> is the working view.{' '}
            <strong>3D preview</strong> is a quick solid view, and{' '}
            <strong>Render</strong> is the lit WebGL one - drag to orbit,
            right-drag to pan, scroll to zoom, and use Cutaway walls to see in.{' '}
            <strong>Wall elevations</strong> draws each wall flat, and{' '}
            <strong>Quote / order</strong> prices what is placed.
          </p>
          <p>
            Drag empty floor to pan the plan, or hold Space to pan over
            cabinets. Above the workspace, <strong>Hide library</strong> and{' '}
            <strong>Hide properties</strong> widen the canvas,{' '}
            <strong>Focus canvas</strong> hides both at once, and{' '}
            <strong>Enlarge canvas</strong> fills the window while keeping the
            editing tools. Escape leaves the enlarged view.
          </p>
        </section>
        <section>
          <h3>When something will not move</h3>
          <p>
            Read the message above the workspace: it says which item refused and
            why. A locked item refuses every change to its geometry until you
            unlock it in Properties. A move or turn that would push something
            out of the room, or into another item, is reported instead of
            applied - and <strong>Undo</strong> reverses anything that did
            apply.
          </p>
          <p>
            <strong>Show clearance zones</strong> draws the access space doors
            and appliances need, and Layout checks lists conflicts with the item
            each one affects.
          </p>
        </section>
        <section>
          <h3>Saving and sharing</h3>
          <p>
            The draft saves automatically in this browser as you work.{' '}
            <strong>Save design</strong> keeps a named copy you can reopen with{' '}
            <strong>Open design</strong>, and Project files exports and imports
            a design as a file.
          </p>
          <p>
            Drawings, item lists, dealer spreadsheets and quotes are
            coordination drafts. Check site measurements, appliance
            specifications, service locations and supplier records before
            anything is ordered or installed.
          </p>
        </section>
      </div>
    </dialog>
  );
}
