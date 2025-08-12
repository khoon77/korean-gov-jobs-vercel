import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { jobPostings, ministryUrls, type JobPosting } from '../shared/schema';
import { eq, desc, sql, and, or, ilike } from 'drizzle-orm';
import { z } from 'zod';
import ws from "ws";

// Vercel serverless function setup
neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle({ client: pool, schema: { jobPostings, ministryUrls } });

const app = express();

// CORS middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://korea-jobportal.co.kr', 'https://korea-jobportal.vercel.app']
    : '*',
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Health check endpoint
app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Get job postings with pagination and filtering
app.get("/api/jobs", async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
    const offset = (page - 1) * limit;
    
    const search = req.query.search as string;
    const ministry = req.query.ministry as string;
    const sortBy = req.query.sortBy as string || 'latest';

    let whereConditions = [];
    
    if (search) {
      whereConditions.push(
        or(
          ilike(jobPostings.title, `%${search}%`),
          ilike(jobPostings.ministry, `%${search}%`),
          ilike(jobPostings.jobType, `%${search}%`)
        )
      );
    }

    if (ministry) {
      whereConditions.push(eq(jobPostings.ministry, ministry));
    }

    const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined;

    let orderBy;
    switch (sortBy) {
      case 'deadline':
        orderBy = jobPostings.applicationPeriodEnd;
        break;
      case 'ministry':
        orderBy = jobPostings.ministry;
        break;
      default:
        orderBy = desc(jobPostings.createdAt);
    }

    const jobsQuery = db
      .select()
      .from(jobPostings)
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset);

    const countQuery = db
      .select({ count: sql<number>`count(*)` })
      .from(jobPostings);

    if (whereClause) {
      jobsQuery.where(whereClause);
      countQuery.where(whereClause);
    }

    const jobs = await jobsQuery;
    const [{ count }] = await countQuery;

    res.json({
      jobPostings: jobs,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error("Error fetching jobs:", error);
    res.status(500).json({ error: "Failed to fetch job postings" });
  }
});

// Get statistics
app.get("/api/statistics", async (req: Request, res: Response) => {
  try {
    const [stats] = await db
      .select({
        totalJobs: sql<number>`count(*)`,
        urgentJobs: sql<number>`count(*) filter (where is_urgent = true)`,
        newJobs: sql<number>`count(*) filter (where is_new = true)`,
        ministries: sql<number>`count(distinct ministry)`
      })
      .from(jobPostings);

    res.json(stats);
  } catch (error) {
    console.error("Error fetching statistics:", error);
    res.status(500).json({ error: "Failed to fetch statistics" });
  }
});

// Get job by ID
app.get("/api/jobs/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const [job] = await db
      .select()
      .from(jobPostings)
      .where(eq(jobPostings.id, id));

    if (!job) {
      return res.status(404).json({ error: "Job posting not found" });
    }

    res.json(job);
  } catch (error) {
    console.error("Error fetching job:", error);
    res.status(500).json({ error: "Failed to fetch job posting" });
  }
});

// PDF endpoint
app.get("/api/pdfs/:filename", (req: Request, res: Response) => {
  const { filename } = req.params;
  
  // For now, redirect to the original URL or return a message
  res.status(200).json({ 
    message: "PDF download feature coming soon",
    filename: filename
  });
});

// Error handling middleware
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Server error:", err);
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  res.status(status).json({ message });
});

// Catch-all handler for SPA
app.get("*", (_req: Request, res: Response) => {
  res.status(404).json({ error: "API endpoint not found" });
});

// Export for Vercel
export default app;