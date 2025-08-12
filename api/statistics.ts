import { VercelRequest, VercelResponse } from '@vercel/node';
import { db } from '../server/db.js';
import { jobPostings, ministryUrls } from '../shared/schema.js';
import { count, gte, eq } from 'drizzle-orm';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    try {
      const currentDate = new Date();
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(currentDate.getDate() - 3);

      const [
        [{ totalJobs }],
        [{ urgentJobs }], 
        [{ newJobs }],
        [{ ministries }]
      ] = await Promise.all([
        db.select({ totalJobs: count() }).from(jobPostings).where(gte(jobPostings.applicationPeriodEnd, currentDate)),
        db.select({ urgentJobs: count() }).from(jobPostings).where(eq(jobPostings.isUrgent, true)),
        db.select({ newJobs: count() }).from(jobPostings).where(gte(jobPostings.createdAt, threeDaysAgo)),
        db.select({ ministries: count() }).from(ministryUrls).where(eq(ministryUrls.isActive, true))
      ]);

      res.status(200).json({
        totalJobs: totalJobs || 0,
        urgentJobs: urgentJobs || 0, 
        newJobs: newJobs || 0,
        ministries: ministries || 0
      });
    } catch (error) {
      console.error('Statistics API error:', error);
      res.status(500).json({ error: 'Failed to fetch statistics' });
    }
  } else {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}