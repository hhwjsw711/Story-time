import type { CSSProperties } from "react";
import type { MomentView } from "@/components/event/types";
import { frameLook } from "@/lib/canvas/look";
import { type Node, ROOT, type Tree } from "@/lib/canvas/model";
import { FrameBoard, Letter, MomentCollage, Print, Scrap, Tape } from "./pieces";

// Draws the things on a canvas, nested the way they are stored: a frame holds
// pieces, a title holds letters. Each carries `data-node-id` so a press can be
// traced back to the thing it landed on.

type Props = { tree: Tree; parent?: string; moments: ReadonlyMap<string, MomentView> };

export function NodeTree({ tree, parent, moments }: Props) {
  return (
    <>
      {(tree.kids.get(parent ?? ROOT) ?? []).map((node) => (
        <Box key={node._id} node={node} tree={tree} moments={moments} />
      ))}
    </>
  );
}

function place(node: Node): CSSProperties {
  return {
    position: "absolute",
    left: node.x,
    top: node.y,
    width: node.w,
    height: node.h,
    transform: node.rotation === 0 ? undefined : `rotate(${node.rotation}deg)`,
  };
}

function Box({ node, tree, moments }: { node: Node; tree: Tree; moments: ReadonlyMap<string, MomentView> }) {
  const common = { "data-node-id": node._id, "data-kind": node.kind, style: place(node) };

  switch (node.kind) {
    case "frame": {
      const look = frameLook(node.look);
      return (
        <div {...common}>
          {/* Its name, above it on the desk, readable at any zoom. Grab it to pick the frame. */}
          <div
            className="absolute bottom-full left-0 whitespace-nowrap font-mono text-stone-600"
            style={{ fontSize: "calc(13px / var(--zoom))", paddingBottom: "calc(6px / var(--zoom))" }}
          >
            {node.order !== undefined && <span className="mr-[0.5em] opacity-60">{node.order}</span>}
            {node.text || "Frame"}
          </div>
          <FrameBoard look={look}>
            <NodeTree tree={tree} parent={node._id} moments={moments} />
          </FrameBoard>
        </div>
      );
    }
    case "ransom":
      return (
        <div {...common}>
          <NodeTree tree={tree} parent={node._id} moments={moments} />
        </div>
      );
    case "letter":
      return (
        <div {...common}>
          <Letter id={node._id} h={node.h} look={node.look} char={node.text} />
        </div>
      );
    case "scrap":
      return (
        <div {...common}>
          <Scrap id={node._id} w={node.w} h={node.h} look={node.look} text={node.text} />
        </div>
      );
    case "photo":
      return (
        <div {...common}>
          {node.mediaId !== undefined && <Print id={node._id} w={node.w} h={node.h} look={node.look} mediaId={node.mediaId} />}
        </div>
      );
    case "tape":
      return (
        <div {...common}>
          <Tape look={node.look} />
        </div>
      );
    case "moment":
      return (
        <div {...common}>
          <MomentCollage id={node._id} w={node.w} h={node.h} moment={node.momentId === undefined ? undefined : moments.get(node.momentId)} />
        </div>
      );
  }
}
