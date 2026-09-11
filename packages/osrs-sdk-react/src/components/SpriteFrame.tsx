import React, { CSSProperties, HTMLAttributes } from "react";

export type FrameAssets = {
  middle: string;
  top: string;
  bottom: string;
  left: string;
  right: string;
  topLeft: string;
  topRight: string;
  bottomLeft: string;
  bottomRight: string;
};

export type SpriteFrameProps = HTMLAttributes<HTMLDivElement> & {
  assets: FrameAssets;
  overlapFrame?: boolean;
  slice: number;
};

const tile = (url: string, style: CSSProperties): CSSProperties => ({
  backgroundImage: `url(${url})`,
  imageRendering: "pixelated",
  pointerEvents: "none",
  position: "absolute",
  ...style,
});

export function SpriteFrame({ assets, children, overlapFrame = false, slice, style, ...props }: SpriteFrameProps) {
  const edgeInset = overlapFrame ? 0 : slice;
  return (
    <div {...props} style={{ position: "relative", ...style }}>
      <span aria-hidden style={tile(assets.middle, { backgroundRepeat: "repeat", inset: overlapFrame ? 0 : slice })} />
      <span aria-hidden style={tile(assets.top, { backgroundPosition: overlapFrame ? "0 -13px" : "0 0", backgroundRepeat: "repeat-x", height: slice, left: edgeInset, right: edgeInset, top: 0 })} />
      <span aria-hidden style={tile(assets.bottom, { backgroundPosition: overlapFrame ? "0 12px" : "0 0", backgroundRepeat: "repeat-x", bottom: 0, height: slice, left: edgeInset, right: edgeInset })} />
      <span aria-hidden style={tile(assets.left, { backgroundPosition: overlapFrame ? "-13px 0" : "0 0", backgroundRepeat: "repeat-y", bottom: edgeInset, left: 0, top: edgeInset, width: slice })} />
      <span aria-hidden style={tile(assets.right, { backgroundPosition: overlapFrame ? "12px 0" : "0 0", backgroundRepeat: "repeat-y", bottom: edgeInset, right: 0, top: edgeInset, width: slice })} />
      <span aria-hidden style={tile(assets.topLeft, { height: slice, left: 0, top: 0, width: slice })} />
      <span aria-hidden style={tile(assets.topRight, { height: slice, right: 0, top: 0, width: slice })} />
      <span aria-hidden style={tile(assets.bottomLeft, { bottom: 0, height: slice, left: 0, width: slice })} />
      <span aria-hidden style={tile(assets.bottomRight, { bottom: 0, height: slice, right: 0, width: slice })} />
      <div style={{ position: "relative" }}>{children}</div>
    </div>
  );
}
