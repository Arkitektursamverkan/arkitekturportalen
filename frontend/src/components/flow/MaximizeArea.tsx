import type React from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Box } from "@mui/material";
import type { SxProps, Theme } from "@mui/material";
import type { SystemStyleObject } from "@mui/system";

/**
 * Lets a picture take over the whole browser window and give it back.
 *
 * The state lives HERE and not in the picture, because the picture is
 * remounted whenever another one is chosen (a layer of a system sketch, the
 * next system process): kept in the picture, choosing a layer would throw the
 * reader back out of the maximised view. A page that has controls belonging
 * to the picture — the layer row — wraps them in the same area, so they
 * follow the picture to full window.
 */
interface Maximering {
  maximized: boolean;
  toggle: () => void;
}

const Sammanhang = createContext<Maximering | null>(null);

/** The surrounding area's state, or null when the picture stands alone. */
export const useMaximizeArea = (): Maximering | null => useContext(Sammanhang);

/** The style that puts a box over the whole window, above the portal's own chrome. */
export const maximizedSx = (maximized: boolean): SystemStyleObject<Theme>[] => [
  maximized
    ? { position: "fixed", inset: 0, zIndex: (theme: Theme) => theme.zIndex.modal, bgcolor: "background.paper" }
    : { position: "relative" },
];

/** State for one maximisable area. Escape gives the window back. */
export function useMaximize(): Maximering {
  const [maximized, setMaximized] = useState(false);
  const toggle = useCallback(() => setMaximized((v) => !v), []);
  useEffect(() => {
    if (!maximized) return;
    const påTangent = (e: KeyboardEvent) => {
      // A dialog or menu opened over the picture closes on Escape first.
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector('[role="dialog"], [role="menu"], [role="listbox"]')) return;
      setMaximized(false);
    };
    window.addEventListener("keydown", påTangent);
    return () => window.removeEventListener("keydown", påTangent);
  }, [maximized]);
  return useMemo(() => ({ maximized, toggle }), [maximized, toggle]);
}

interface Props {
  children: React.ReactNode;
  sx?: SxProps<Theme>;
}

export default function MaximizeArea({ children, sx }: Props) {
  const läge = useMaximize();
  return (
    <Sammanhang.Provider value={läge}>
      <Box sx={[...(Array.isArray(sx) ? sx : [sx]), ...maximizedSx(läge.maximized)]}>{children}</Box>
    </Sammanhang.Provider>
  );
}
