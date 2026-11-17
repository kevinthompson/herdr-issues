// The text sizes the settings view and repository setup draw with, from the design canvas's type scale: a page's
// question at XL, a blank state's heading at LG, a setting's label, sentences and values at SM, and
// descriptions and hints at XS. Section headings keep their own smaller size (section.js).
export const TEXT_XS_PX = 12;
export const TEXT_SM_PX = 14;
export const TEXT_LG_PX = 18;
export const TEXT_XL_PX = 20;
// The page question's line height, 1.3 times its size. It's a length string because `line_height` reads a bare
// number as a multiple of the text size.
export const TEXT_XL_LINE_HEIGHT = "26px";
