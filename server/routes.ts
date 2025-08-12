import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { searchJobsSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // Get all job postings with filters
  app.get("/api/jobs", async (req, res) => {
    try {
      // Convert string query parameters to appropriate types
      const queryParams = {
        ...req.query,
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 10,
      };
      
      const filters = searchJobsSchema.parse(queryParams);
      const result = await storage.getJobPostings(filters);
      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid query parameters", details: error.errors });
      } else {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  });

  // Get single job posting
  app.get("/api/jobs/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const jobPosting = await storage.getJobPosting(id);
      
      if (!jobPosting) {
        res.status(404).json({ error: "Job posting not found" });
        return;
      }
      
      res.json(jobPosting);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get statistics
  app.get("/api/statistics", async (req, res) => {
    try {
      const stats = await storage.getStatistics();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Serve PDF files (mock endpoint with sample PDF content)
  app.get("/api/pdfs/:filename", (req, res) => {
    const { filename } = req.params;
    
    // Create a sample PDF content explaining this is a demo
    const pdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj

2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj

3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 4 0 R
/Resources << /Font << /F1 5 0 R >> >>
>>
endobj

4 0 obj
<<
/Length 280
>>
stream
BT
/F1 16 Tf
50 720 Td
(정부 채용공고 원본 문서) Tj
0 -30 Td
/F1 12 Tf
(파일명: ${filename}) Tj
0 -25 Td
(이 문서는 데모용 샘플 PDF입니다.) Tj
0 -25 Td
(실제 정부 채용공고 PDF가 여기에 표시됩니다.) Tj
0 -40 Td
(현재 구현된 기능:) Tj
0 -20 Td
(• 채용공고 목록 조회) Tj
0 -20 Td
(• 부처별 필터링) Tj
0 -20 Td
(• 상세정보 보기) Tj
0 -20 Td
(• PDF 문서 뷰어) Tj
0 -40 Td
(향후 실제 정부 사이트 API 연동 예정) Tj
ET
endstream
endobj

5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj

xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000251 00000 n 
0000000583 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
650
%%EOF`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.status(200).send(Buffer.from(pdfContent));
  });

  const httpServer = createServer(app);
  return httpServer;
}
