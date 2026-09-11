import buttonMiddle from "./images/interface/resource-pack/button/middle.png";
import buttonMiddleSelected from "./images/interface/resource-pack/button/middle_selected.png";
import buttonEdgeTop from "./images/interface/resource-pack/button/edge_top.png";
import buttonEdgeTopSelected from "./images/interface/resource-pack/button/edge_top_selected.png";
import buttonEdgeBottom from "./images/interface/resource-pack/button/edge_bottom.png";
import buttonEdgeBottomSelected from "./images/interface/resource-pack/button/edge_bottom_selected.png";
import buttonEdgeLeft from "./images/interface/resource-pack/button/edge_left.png";
import buttonEdgeLeftSelected from "./images/interface/resource-pack/button/edge_left_selected.png";
import buttonEdgeRight from "./images/interface/resource-pack/button/edge_right.png";
import buttonEdgeRightSelected from "./images/interface/resource-pack/button/edge_right_selected.png";
import buttonCornerTopLeft from "./images/interface/resource-pack/button/corner_top_left.png";
import buttonCornerTopLeftSelected from "./images/interface/resource-pack/button/corner_top_left_selected.png";
import buttonCornerTopRight from "./images/interface/resource-pack/button/corner_top_right.png";
import buttonCornerTopRightSelected from "./images/interface/resource-pack/button/corner_top_right_selected.png";
import buttonCornerBottomLeft from "./images/interface/resource-pack/button/corner_bottom_left.png";
import buttonCornerBottomLeftSelected from "./images/interface/resource-pack/button/corner_bottom_left_selected.png";
import buttonCornerBottomRight from "./images/interface/resource-pack/button/corner_bottom_right.png";
import buttonCornerBottomRightSelected from "./images/interface/resource-pack/button/corner_bottom_right_selected.png";
import dialogBackground from "./images/interface/resource-pack/dialog/background.png";
import dialogCornerTopLeft from "./images/interface/resource-pack/dialog/bottom_line_mode_side_panel_corner_top_left.png";
import dialogCornerTopRight from "./images/interface/resource-pack/dialog/bottom_line_mode_side_panel_corner_top_right.png";
import dialogCornerBottomLeft from "./images/interface/resource-pack/dialog/bottom_line_mode_side_panel_corner_bottom_left.png";
import dialogCornerBottomRight from "./images/interface/resource-pack/dialog/bottom_line_mode_side_panel_corner_bottom_right.png";
import dialogEdgeTop from "./images/interface/resource-pack/dialog/bottom_line_mode_side_panel_edge_top.png";
import dialogEdgeBottom from "./images/interface/resource-pack/dialog/bottom_line_mode_side_panel_edge_bottom.png";
import dialogEdgeLeft from "./images/interface/resource-pack/dialog/bottom_line_mode_side_panel_edge_left.png";
import dialogEdgeRight from "./images/interface/resource-pack/dialog/bottom_line_mode_side_panel_edge_right.png";

export const INTERFACE_ASSETS = {
  button: {
    normal: {
      middle: buttonMiddle, top: buttonEdgeTop, bottom: buttonEdgeBottom,
      left: buttonEdgeLeft, right: buttonEdgeRight,
      topLeft: buttonCornerTopLeft, topRight: buttonCornerTopRight,
      bottomLeft: buttonCornerBottomLeft, bottomRight: buttonCornerBottomRight,
    },
    selected: {
      middle: buttonMiddleSelected, top: buttonEdgeTopSelected, bottom: buttonEdgeBottomSelected,
      left: buttonEdgeLeftSelected, right: buttonEdgeRightSelected,
      topLeft: buttonCornerTopLeftSelected, topRight: buttonCornerTopRightSelected,
      bottomLeft: buttonCornerBottomLeftSelected, bottomRight: buttonCornerBottomRightSelected,
    },
  },
  dialog: {
    background: dialogBackground,
    top: dialogEdgeTop, bottom: dialogEdgeBottom, left: dialogEdgeLeft, right: dialogEdgeRight,
    topLeft: dialogCornerTopLeft, topRight: dialogCornerTopRight,
    bottomLeft: dialogCornerBottomLeft, bottomRight: dialogCornerBottomRight,
  },
} as const;
