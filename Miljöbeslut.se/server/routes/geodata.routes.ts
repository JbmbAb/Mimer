import express from 'express';
import { rateLimitByUser } from '../security/rateLimit';
import { toSafeErrorResponse } from '../security/secureErrors';
import {
  parseBbox,
  getProtectedAreaLayer,
  getWaterProtectionLayer,
  getSguGroundLayerLayer,
  getSguWellLayer,
  getHydroLayer,
  getPropertyLayer,
  getTopo10Layer,
} from '../modules/gis/public';
import { parsePositiveInt } from '../utils/routeUtils';

/**
 * Semantiska GeoJSON-endpoints för lokaliseringskartan.
 * Samma data som /api/layers/* men med läsbara path-namn (/api/geodata/soil m.m.).
 */
const router = express.Router();

router.get('/api/geodata/soil', rateLimitByUser(30, 60_000), async (req, res) => {
  try {
    const rawBbox = typeof req.query.bbox === 'string' ? req.query.bbox : null;
    const bbox = parseBbox(rawBbox);
    if (!bbox) {
      res.status(400).json({ error: 'bbox is required' });
      return;
    }
    const collection = await getSguGroundLayerLayer(bbox);
    res.json(collection);
  } catch (error: unknown) {
    res.status(500).json(toSafeErrorResponse(error));
  }
});

router.get('/api/geodata/wells', rateLimitByUser(30, 60_000), async (req, res) => {
  try {
    const rawBbox = typeof req.query.bbox === 'string' ? req.query.bbox : null;
    const bbox = parseBbox(rawBbox);
    if (!bbox) {
      res.status(400).json({ error: 'bbox is required' });
      return;
    }
    const limit = parsePositiveInt(req.query.limit, 2000, 1, 5000);
    const collection = await getSguWellLayer(bbox, limit);
    res.json(collection);
  } catch (error: unknown) {
    res.status(500).json(toSafeErrorResponse(error));
  }
});

router.get('/api/geodata/lakes', rateLimitByUser(30, 60_000), async (req, res) => {
  try {
    const rawBbox = typeof req.query.bbox === 'string' ? req.query.bbox : null;
    const bbox = parseBbox(rawBbox);
    if (rawBbox && !bbox) {
      res.status(400).json({ error: 'Invalid bbox' });
      return;
    }
    const collection = await getHydroLayer('lakes', bbox);
    res.json(collection);
  } catch (error: unknown) {
    res.status(500).json(toSafeErrorResponse(error));
  }
});

router.get('/api/geodata/streams', rateLimitByUser(30, 60_000), async (req, res) => {
  try {
    const rawBbox = typeof req.query.bbox === 'string' ? req.query.bbox : null;
    const bbox = parseBbox(rawBbox);
    if (rawBbox && !bbox) {
      res.status(400).json({ error: 'Invalid bbox' });
      return;
    }
    const collection = await getHydroLayer('streams', bbox);
    res.json(collection);
  } catch (error: unknown) {
    res.status(500).json(toSafeErrorResponse(error));
  }
});

router.get('/api/geodata/topo-water', rateLimitByUser(30, 60_000), async (req, res) => {
  try {
    const rawBbox = typeof req.query.bbox === 'string' ? req.query.bbox : null;
    const bbox = parseBbox(rawBbox);
    if (!bbox) {
      res.status(400).json({ error: 'bbox is required' });
      return;
    }
    const collection = await getTopo10Layer(bbox, 'vatten');
    res.json(collection);
  } catch (error: unknown) {
    res.status(500).json(toSafeErrorResponse(error));
  }
});

router.get('/api/geodata/topo-buildings', rateLimitByUser(30, 60_000), async (req, res) => {
  try {
    const rawBbox = typeof req.query.bbox === 'string' ? req.query.bbox : null;
    const bbox = parseBbox(rawBbox);
    if (!bbox) {
      res.status(400).json({ error: 'bbox is required' });
      return;
    }
    const collection = await getTopo10Layer(bbox, 'buildings');
    res.json(collection);
  } catch (error: unknown) {
    res.status(500).json(toSafeErrorResponse(error));
  }
});

router.get('/api/geodata/topo-mark', rateLimitByUser(30, 60_000), async (req, res) => {
  try {
    const rawBbox = typeof req.query.bbox === 'string' ? req.query.bbox : null;
    const bbox = parseBbox(rawBbox);
    if (!bbox) {
      res.status(400).json({ error: 'bbox is required' });
      return;
    }
    const collection = await getTopo10Layer(bbox, 'mark');
    res.json(collection);
  } catch (error: unknown) {
    res.status(500).json(toSafeErrorResponse(error));
  }
});

router.get('/api/geodata/water-protection', rateLimitByUser(30, 60_000), async (req, res) => {
  try {
    const rawBbox = typeof req.query.bbox === 'string' ? req.query.bbox : null;
    const bbox = parseBbox(rawBbox);
    if (rawBbox && !bbox) {
      res.status(400).json({ error: 'Invalid bbox' });
      return;
    }
    const limit = parsePositiveInt(req.query.limit, 1000, 1, 2000);
    const collection = await getWaterProtectionLayer(bbox, limit);
    res.json(collection);
  } catch (error: unknown) {
    res.status(500).json(toSafeErrorResponse(error));
  }
});

router.get('/api/geodata/protected-nature', rateLimitByUser(30, 60_000), async (req, res) => {
  try {
    const rawBbox = typeof req.query.bbox === 'string' ? req.query.bbox : null;
    const bbox = parseBbox(rawBbox);
    if (rawBbox && !bbox) {
      res.status(400).json({ error: 'Invalid bbox' });
      return;
    }
    const limit = parsePositiveInt(req.query.limit, 1000, 1, 2000);
    const collection = await getProtectedAreaLayer(bbox, limit);
    res.json(collection);
  } catch (error: unknown) {
    res.status(500).json(toSafeErrorResponse(error));
  }
});

router.get('/api/geodata/property', rateLimitByUser(30, 60_000), async (req, res) => {
  try {
    const rawBbox = typeof req.query.bbox === 'string' ? req.query.bbox : null;
    const bbox = parseBbox(rawBbox);
    if (!bbox) {
      res.status(400).json({ error: 'bbox is required' });
      return;
    }
    const collection = await getPropertyLayer(bbox);
    res.json(collection);
  } catch (error: unknown) {
    res.status(500).json(toSafeErrorResponse(error));
  }
});

export default router;
