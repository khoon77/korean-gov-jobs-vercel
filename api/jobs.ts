import { VercelRequest, VercelResponse } from '@vercel/node';
import { db } from '../server/db.js';
import { jobPostings } from '../shared/schema.js';
import { eq, desc, asc, and, or, like, count, gte, sql } from 'drizzle-orm';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const search = req.query.search as string || '';
      const ministry = req.query.ministry as string || '';
      const sortBy = req.query.sortBy as string || 'latest';

      const currentDate = new Date();
      let whereClause = gte(jobPostings.applicationPeriodEnd, currentDate);

      if (search) {
        const searchTerm = `%${search.toLowerCase()}%`;
        whereClause = and(
          whereClause,
          or(
            like(jobPostings.title, searchTerm),
            like(jobPostings.ministry, searchTerm),
            like(jobPostings.jobType, searchTerm),
            like(jobPostings.description, searchTerm)
          )
        );
      }

      if (ministry && ministry !== "전체 부처") {
        whereClause = and(whereClause, eq(jobPostings.ministry, ministry));
      }

      const offset = (page - 1) * limit;

      // Get total count first
      const [{ count: totalCount }] = await db
        .select({ count: count() })
        .from(jobPostings)
        .where(whereClause);

      // Get jobs with sorting
      let jobs;
      if (sortBy === "deadline") {
        jobs = await db
          .select()
          .from(jobPostings)
          .where(whereClause)
          .orderBy(asc(jobPostings.applicationPeriodEnd))
          .limit(limit)
          .offset(offset);
      } else if (sortBy === "ministry") {
        jobs = await db
          .select()
          .from(jobPostings)
          .where(whereClause)
          .orderBy(asc(jobPostings.ministry))
          .limit(limit)
          .offset(offset);
      } else {
        jobs = await db
          .select()
          .from(jobPostings)
          .where(whereClause)
          .orderBy(desc(jobPostings.createdAt))
          .limit(limit)
          .offset(offset);
      }
      
      res.status(200).json({
        jobPostings: jobs,
        total: totalCount || 0,
        page,
        totalPages: Math.ceil((totalCount || 0) / limit)
      });
    } catch (error) {
      console.error('Jobs API error:', error);
      res.status(500).json({ error: 'Failed to fetch jobs' });
    }
  } else {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}