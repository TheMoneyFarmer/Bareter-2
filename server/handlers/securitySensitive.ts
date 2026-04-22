import type { Request, Response, NextFunction, RequestHandler } from "express";
import { z } from "zod";
import { registerSchema, adminKybStatusSchema } from "@shared/schema";
import { isValidPrivateDocPath, canAccessPrivateDoc } from "../security";

interface SessionLike {
  userId?: string;
}

interface PrivateDocCaller {
  isAdmin?: boolean | null;
}

/**
 * Validation gate for `POST /api/auth/register`.
 *
 * Parses the body with the production `registerSchema` (which is `.strict()`)
 * and rejects unknown fields with a 400. Calls `next()` with the parsed
 * payload attached as `res.locals.registerData` so the route can do the
 * heavy DB work without re-parsing.
 */
export function makeRegisterValidator(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = registerSchema.parse(req.body);
      res.locals.registerData = data;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res
          .status(400)
          .json({ message: error.errors[0]?.message || "Invalid payload" });
      }
      next(error);
    }
  };
}

/**
 * Validation gate for `PATCH /api/admin/users/:id/kyb`.
 *
 * Parses the body with the strict, whitelisted KYB enum schema.
 */
export function makeAdminKybValidator(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const { status } = adminKybStatusSchema.parse(req.body);
      res.locals.kybStatus = status;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message:
            "Status must be one of NOT_STARTED, IN_PROGRESS, PENDING_REVIEW, APPROVED, DECLINED",
        });
      }
      next(error);
    }
  };
}

/**
 * Authorization gate for `GET /api/private-docs/:userId/:filename`.
 *
 * Validates the path segments, then ensures the caller is either the
 * document owner or an admin. On success, calls `next()` and downstream
 * code can perform the actual object-storage download.
 */
export function makePrivateDocAuthGate(deps: {
  getUser: (id: string) => Promise<PrivateDocCaller | undefined>;
}): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const ownerId = req.params.userId;
    const filename = req.params.filename;
    if (!isValidPrivateDocPath(ownerId, filename)) {
      return res.status(400).json({ message: "Invalid path" });
    }
    const session = req.session as SessionLike | undefined;
    const callerId = session?.userId;
    if (!callerId) return res.status(401).json({ message: "Unauthorized" });
    const caller = await deps.getUser(callerId);
    if (
      !canAccessPrivateDoc({
        callerId,
        ownerId: ownerId as string,
        isAdmin: caller?.isAdmin ?? false,
      })
    ) {
      return res.status(403).json({ message: "Forbidden" });
    }
    next();
  };
}
