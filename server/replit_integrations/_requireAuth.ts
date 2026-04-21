import type { Request, Response, NextFunction } from "express";

export function requireAuthBlueprint(req: Request, res: Response, next: NextFunction) {
  if (!(req.session as any)?.userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}
