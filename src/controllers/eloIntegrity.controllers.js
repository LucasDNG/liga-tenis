import {
  runEloIntegrityAudit,
} from "../services/eloIntegrity.service.js";


/*
  ============================================================
  AUDITORÍA DE INTEGRIDAD ELO

  Solo administrador.

  Esta operación es READ ONLY.

  No repara ni modifica datos.
  ============================================================
*/

export const getEloIntegrityAudit =
  async (
    _req,
    res,
    next,
  ) => {
    try {
      const audit =
        await runEloIntegrityAudit();

      res.json(audit);
    } catch (error) {
      next(error);
    }
  };