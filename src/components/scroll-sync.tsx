"use client";

import { useEffect } from "react";

/**
 * Links the horizontal scroll of the day board and the hotel timeline by DAY, not by pixels:
 * scrolling one to "day N" scrolls the other to "day N". Elements are found by data attributes
 * ([data-sync="board"] with [data-col] children, [data-sync="hotel"] with data-step px per day).
 */
export function ScrollSync() {
  useEffect(() => {
    const board = document.querySelector<HTMLElement>('[data-sync="board"]');
    const hotel = document.querySelector<HTMLElement>('[data-sync="hotel"]');
    if (!board || !hotel) return;
    let lock: "board" | "hotel" | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const boardStep = () => {
      const cols = board.querySelectorAll<HTMLElement>("[data-col]");
      return cols.length > 1 ? cols[1].offsetLeft - cols[0].offsetLeft : cols[0]?.offsetWidth || 0;
    };
    const hotelStep = () => Number(hotel.dataset.step) || 96;

    const follow = (from: "board" | "hotel") => () => {
      if (lock && lock !== from) return; // this scroll was caused by our own sync
      lock = from;
      clearTimeout(timer);
      timer = setTimeout(() => (lock = null), 120);
      const bs = boardStep();
      if (!bs) return;
      if (from === "board") hotel.scrollLeft = (board.scrollLeft / bs) * hotelStep();
      else board.scrollLeft = (hotel.scrollLeft / hotelStep()) * bs;
    };
    const onBoard = follow("board");
    const onHotel = follow("hotel");
    board.addEventListener("scroll", onBoard, { passive: true });
    hotel.addEventListener("scroll", onHotel, { passive: true });
    return () => {
      board.removeEventListener("scroll", onBoard);
      hotel.removeEventListener("scroll", onHotel);
      clearTimeout(timer);
    };
  }, []);
  return null;
}
