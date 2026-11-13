import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useGraphStore } from "./graphStore";

/**
 * Closes the detail panel when the user goes to another page.
 *
 * The selection lives in a store, not in the page, so it outlived the page it
 * was made on: the panel for an object stayed open over whatever page the menu
 * led to next. Only the path counts – the pages keep their own choices in the
 * query string, and changing those is not leaving the page.
 */
export function useClearSelectionOnNavigate(): void {
  const { pathname } = useLocation();
  const previous = useRef(pathname);
  useEffect(() => {
    if (previous.current === pathname) return;
    previous.current = pathname;
    useGraphStore.getState().clearSelection();
  }, [pathname]);
}
