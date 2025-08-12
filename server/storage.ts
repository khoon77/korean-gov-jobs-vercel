import { type JobPosting, type InsertJobPosting, jobPostings, ministryUrls, type MinistryUrl, type InsertMinistryUrl } from "@shared/schema";
import { db } from "./db";
import { eq, desc, asc, and, or, like, count, sql, gte } from "drizzle-orm";
import { randomUUID } from "crypto";

export interface IStorage {
  getJobPosting(id: string): Promise<JobPosting | undefined>;
  getJobPostings(filters?: {
    query?: string;
    ministry?: string;
    jobType?: string;
    employmentType?: string;
    sortBy?: "latest" | "deadline" | "ministry";
    page?: number;
    limit?: number;
  }): Promise<{ jobPostings: JobPosting[]; total: number }>;
  createJobPosting(jobPosting: InsertJobPosting): Promise<JobPosting>;
  getStatistics(): Promise<{
    totalJobs: number;
    urgentJobs: number;
    newJobs: number;
    ministries: number;
  }>;
  getMinistryUrls(): Promise<MinistryUrl[]>;
  updateMinistryLastChecked(id: string): Promise<void>;
  deleteOldJobPostings(daysOld: number): Promise<number>;
  checkIfJobExists(title: string, ministry: string): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  async getJobPosting(id: string): Promise<JobPosting | undefined> {
    const [jobPosting] = await db.select().from(jobPostings).where(eq(jobPostings.id, id));
    return jobPosting || undefined;
  }

  async getJobPostings(filters: {
    query?: string;
    ministry?: string;
    jobType?: string;
    employmentType?: string;
    sortBy?: "latest" | "deadline" | "ministry";
    page?: number;
    limit?: number;
  } = {}): Promise<{ jobPostings: JobPosting[]; total: number }> {
    const conditions = [];
    
    // 접수기간이 완료되지 않은 공고만 가져오기
    const currentDate = new Date();
    conditions.push(gte(jobPostings.applicationPeriodEnd, currentDate));
    
    // Apply filters
    if (filters.query) {
      const searchTerm = `%${filters.query.toLowerCase()}%`;
      conditions.push(
        or(
          like(sql`lower(${jobPostings.title})`, searchTerm),
          like(sql`lower(${jobPostings.ministry})`, searchTerm),
          like(sql`lower(${jobPostings.jobType})`, searchTerm),
          like(sql`lower(${jobPostings.description})`, searchTerm)
        )
      );
    }

    if (filters.ministry && filters.ministry !== "전체 부처") {
      conditions.push(eq(jobPostings.ministry, filters.ministry));
    }

    if (filters.jobType && filters.jobType !== "전체 직종") {
      conditions.push(like(jobPostings.jobType, `%${filters.jobType}%`));
    }

    if (filters.employmentType && filters.employmentType !== "전체 고용형태") {
      conditions.push(eq(jobPostings.employmentType, filters.employmentType));
    }

    // Get total count
    const [{ count: total }] = await db
      .select({ count: count() })
      .from(jobPostings)
      .where(and(...conditions));

    // Build main query
    const query = db.select().from(jobPostings).where(and(...conditions));

    // Apply sorting
    let orderedQuery;
    switch (filters.sortBy) {
      case "deadline":
        orderedQuery = query.orderBy(asc(jobPostings.applicationPeriodEnd));
        break;
      case "ministry":
        orderedQuery = query.orderBy(asc(jobPostings.ministry));
        break;
      case "latest":
      default:
        orderedQuery = query.orderBy(desc(jobPostings.createdAt));
        break;
    }

    // Apply pagination
    const page = filters.page || 1;
    const limit = filters.limit || 10;
    const offset = (page - 1) * limit;

    const jobPostingsList = await orderedQuery.limit(limit).offset(offset);

    return {
      jobPostings: jobPostingsList,
      total,
    };
  }

  async createJobPosting(insertJobPosting: InsertJobPosting): Promise<JobPosting> {
    const [jobPosting] = await db
      .insert(jobPostings)
      .values(insertJobPosting)
      .returning();
    return jobPosting;
  }

  async getStatistics(): Promise<{
    totalJobs: number;
    urgentJobs: number;
    newJobs: number;
    ministries: number;
  }> {
    const [totalResult] = await db.select({ count: count() }).from(jobPostings);
    const [urgentResult] = await db.select({ count: count() }).from(jobPostings).where(eq(jobPostings.isUrgent, true));
    const [newResult] = await db.select({ count: count() }).from(jobPostings).where(eq(jobPostings.isNew, true));
    const ministryResult = await db.selectDistinct({ ministry: jobPostings.ministry }).from(jobPostings);

    return {
      totalJobs: totalResult.count,
      urgentJobs: urgentResult.count,
      newJobs: newResult.count,
      ministries: ministryResult.length,
    };
  }

  async getMinistryUrls(): Promise<MinistryUrl[]> {
    return await db.select().from(ministryUrls).where(eq(ministryUrls.isActive, true));
  }

  async updateMinistryLastChecked(id: string): Promise<void> {
    await db
      .update(ministryUrls)
      .set({ lastChecked: new Date() })
      .where(eq(ministryUrls.id, id));
  }

  async deleteOldJobPostings(daysOld: number = 60): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    const result = await db
      .delete(jobPostings)
      .where(sql`${jobPostings.createdAt} < ${cutoffDate}`)
      .returning({ id: jobPostings.id });
    
    return result.length;
  }

  async checkIfJobExists(title: string, ministry: string): Promise<boolean> {
    const [result] = await db
      .select({ count: count() })
      .from(jobPostings)
      .where(and(
        eq(jobPostings.title, title),
        eq(jobPostings.ministry, ministry)
      ));
    
    return result.count > 0;
  }


}

export class MemStorage implements IStorage {
  private jobPostings: Map<string, JobPosting>;

  constructor() {
    this.jobPostings = new Map();
    this.initializeSampleData();
  }

  async getMinistryUrls(): Promise<MinistryUrl[]> {
    return [];
  }

  async updateMinistryLastChecked(id: string): Promise<void> {
    // No-op for memory storage
  }

  async deleteOldJobPostings(daysOld: number): Promise<number> {
    return 0;
  }

  async checkIfJobExists(title: string, ministry: string): Promise<boolean> {
    const jobs = Array.from(this.jobPostings.values());
    return jobs.some(job => job.title === title && job.ministry === ministry);
  }

  private initializeSampleData() {
    const sampleJobs: InsertJobPosting[] = [
      {
        title: "2024년 행정안전부 디지털정부혁신실 정보보안 전문가 채용",
        ministry: "행정안전부",
        department: "디지털정부혁신실",
        jobType: "기술직 7급",
        employmentType: "정규직",
        location: "서울특별시 종로구 세종대로 209",
        positions: 3,
        description: "정부 정보보안 정책 수립 및 시행, 사이버보안 체계 구축 및 운영, 정보보안 관련 법령 제·개정 업무, 정보보안 교육 및 홍보 업무, 국제 사이버보안 협력 업무",
        requirements: "정보보안 관련 학과 졸업자 또는 관련 자격증 소지자, 정보보안 분야 3년 이상 경력자, 컴퓨터활용능력 1급 이상, 영어 가능자 우대",
        preferredQualifications: "정보보안기사, CISSP, CISA 등 정보보안 관련 자격증 소지자, 공공기관 정보보안 업무 경험자, 석사학위 이상 소지자",
        applicationPeriodStart: new Date("2023-12-20"),
        applicationPeriodEnd: new Date("2024-01-15"),
        contact: "02-2100-3000",
        originalUrl: "https://www.mois.go.kr/frt/bbs/type013/commonSelectBoardList.do?bbsId=BBSMSTR_000000000006",
        pdfUrl: "/api/pdfs/mois-security-expert.pdf",
        isUrgent: true,
        isNew: false,
      },
      {
        title: "2024년 기획재정부 예산정책국 예산분석관 채용",
        ministry: "기획재정부",
        department: "예산정책국",
        jobType: "행정직 6급",
        employmentType: "정규직",
        location: "서울특별시 종로구 세종대로 209",
        positions: 2,
        description: "국가예산 편성 및 분석, 재정정책 연구 및 기획, 예산안 작성 및 심의 지원, 재정통계 관리 및 분석",
        requirements: "경제학, 행정학, 회계학 관련 학과 졸업자, 예산 또는 재정 분야 경력 3년 이상, 엑셀 고급 활용 가능자",
        preferredQualifications: "공인회계사, 세무사 등 관련 자격증 소지자, 공공기관 예산 업무 경험자, 석사학위 이상 소지자",
        applicationPeriodStart: new Date("2023-12-22"),
        applicationPeriodEnd: new Date("2024-01-25"),
        contact: "044-215-2114",
        originalUrl: "https://www.moef.go.kr/nw/notice/emrc.do",
        pdfUrl: "/api/pdfs/moef-budget-analyst.pdf",
        isUrgent: false,
        isNew: false,
      },
      {
        title: "2024년 고용노동부 고용정책실 노동시장분석 연구원 채용",
        ministry: "고용노동부",
        department: "고용정책실",
        jobType: "연구직",
        employmentType: "계약직",
        location: "세종특별자치시 한누리대로 422",
        positions: 5,
        description: "노동시장 동향 분석 및 전망, 고용정책 연구개발, 노동통계 수집 및 분석, 고용정책 효과성 평가",
        requirements: "경제학, 통계학, 사회학 관련 학과 졸업자, 연구 경력 2년 이상, 통계분석 프로그램 활용 가능자",
        preferredQualifications: "박사학위 소지자, 노동경제학 전공자, 영어 능통자, 관련 연구소 경력자",
        applicationPeriodStart: new Date("2024-01-02"),
        applicationPeriodEnd: new Date("2024-02-05"),
        contact: "044-202-7100",
        originalUrl: "https://www.moel.go.kr/news/notice/noticeList.do",
        pdfUrl: "/api/pdfs/moel-labor-researcher.pdf",
        isUrgent: false,
        isNew: true,
      },
      {
        title: "2024년 교육부 평생직업교육국 직업교육정책 담당자 채용",
        ministry: "교육부",
        department: "평생직업교육국",
        jobType: "교육직 6급",
        employmentType: "정규직",
        location: "세종특별자치시 갈매로 408",
        positions: 4,
        description: "평생교육 및 직업교육 정책 기획·수립, 직업교육기관 지원 및 관리, 평생교육 프로그램 개발 및 운영",
        requirements: "교육학, 평생교육학 관련 학과 졸업자, 교육 분야 경력 3년 이상, 평생교육사 자격증 소지자",
        preferredQualifications: "교육정책 관련 석사학위 이상, 공공기관 교육정책 업무 경험자, 교육과정 개발 경험자",
        applicationPeriodStart: new Date("2023-12-28"),
        applicationPeriodEnd: new Date("2024-01-30"),
        contact: "044-203-6000",
        originalUrl: "https://www.moe.go.kr/boardCnts/listRenew.do?boardID=194",
        pdfUrl: "/api/pdfs/moe-education-policy.pdf",
        isUrgent: false,
        isNew: false,
      },
      {
        title: "2024년 환경부 기후변화정책관 탄소중립정책 인턴 모집",
        ministry: "환경부",
        department: "기후변화정책관",
        jobType: "환경직",
        employmentType: "인턴",
        location: "세종특별자치시 도움6로 11",
        positions: 6,
        description: "탄소중립 정책 연구 및 기획 지원, 국제 기후변화 협력 업무 지원, 온실가스 감축 정책 분석",
        requirements: "환경공학, 환경정책 관련 학과 재학생 또는 졸업생, 영어 가능자, 기후변화 관련 지식 보유자",
        preferredQualifications: "환경영향평가사, 온실가스관리기사 등 관련 자격증, 환경정책 관련 연구 경험자, 토익 800점 이상",
        applicationPeriodStart: new Date("2023-12-25"),
        applicationPeriodEnd: new Date("2024-01-20"),
        contact: "044-201-6600",
        originalUrl: "https://www.me.go.kr/home/web/index.do?menuId=10530",
        pdfUrl: "/api/pdfs/me-climate-intern.pdf",
        isUrgent: true,
        isNew: false,
      },
    ];

    sampleJobs.forEach(job => {
      const id = randomUUID();
      const jobPosting: JobPosting = {
        ...job,
        id,
        createdAt: new Date(),
        updatedAt: new Date(),
        preferredQualifications: job.preferredQualifications || null,
        pdfUrl: job.pdfUrl || null,
        isUrgent: job.isUrgent || false,
        isNew: job.isNew || false,
      };
      this.jobPostings.set(id, jobPosting);
    });
  }

  async getJobPosting(id: string): Promise<JobPosting | undefined> {
    return this.jobPostings.get(id);
  }

  async getJobPostings(filters: {
    query?: string;
    ministry?: string;
    jobType?: string;
    employmentType?: string;
    sortBy?: "latest" | "deadline" | "ministry";
    page?: number;
    limit?: number;
  } = {}): Promise<{ jobPostings: JobPosting[]; total: number }> {
    let filtered = Array.from(this.jobPostings.values());

    // 접수기간이 완료되지 않은 공고만 가져오기
    const currentDate = new Date();
    filtered = filtered.filter(job => new Date(job.applicationPeriodEnd) >= currentDate);

    // Apply filters
    if (filters.query) {
      const query = filters.query.toLowerCase();
      filtered = filtered.filter(job =>
        job.title.toLowerCase().includes(query) ||
        job.ministry.toLowerCase().includes(query) ||
        job.jobType.toLowerCase().includes(query) ||
        job.description.toLowerCase().includes(query)
      );
    }

    if (filters.ministry && filters.ministry !== "전체 부처") {
      filtered = filtered.filter(job => job.ministry === filters.ministry);
    }

    if (filters.jobType && filters.jobType !== "전체 직종") {
      filtered = filtered.filter(job => job.jobType.includes(filters.jobType!));
    }

    if (filters.employmentType && filters.employmentType !== "전체 고용형태") {
      filtered = filtered.filter(job => job.employmentType === filters.employmentType);
    }

    // Apply sorting
    switch (filters.sortBy) {
      case "deadline":
        filtered.sort((a, b) => new Date(a.applicationPeriodEnd).getTime() - new Date(b.applicationPeriodEnd).getTime());
        break;
      case "ministry":
        filtered.sort((a, b) => a.ministry.localeCompare(b.ministry));
        break;
      case "latest":
      default:
        filtered.sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
        break;
    }

    const total = filtered.length;
    const page = filters.page || 1;
    const limit = filters.limit || 10;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;

    return {
      jobPostings: filtered.slice(startIndex, endIndex),
      total,
    };
  }

  async createJobPosting(insertJobPosting: InsertJobPosting): Promise<JobPosting> {
    const id = randomUUID();
    const jobPosting: JobPosting = {
      ...insertJobPosting,
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
      preferredQualifications: insertJobPosting.preferredQualifications || null,
      pdfUrl: insertJobPosting.pdfUrl || null,
      isUrgent: insertJobPosting.isUrgent || false,
      isNew: insertJobPosting.isNew || false,
    };
    this.jobPostings.set(id, jobPosting);
    return jobPosting;
  }

  async getStatistics(): Promise<{
    totalJobs: number;
    urgentJobs: number;
    newJobs: number;
    ministries: number;
  }> {
    const allJobs = Array.from(this.jobPostings.values());
    const ministrySet = new Set(allJobs.map(job => job.ministry));

    return {
      totalJobs: allJobs.length,
      urgentJobs: allJobs.filter(job => job.isUrgent).length,
      newJobs: allJobs.filter(job => job.isNew).length,
      ministries: ministrySet.size,
    };
  }
}

export const storage = new DatabaseStorage();
