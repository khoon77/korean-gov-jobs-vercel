import { db } from "./db";
import { ministryUrls, jobPostings } from "@shared/schema";
import { count } from "drizzle-orm";

// 정부 부처 URL 초기 데이터
const MINISTRY_URLS = [
  { name: "기획재정부", url: "https://www.moef.go.kr/nw/notice/emrc.do;jsessionid=FzBiPexPRZpNxQLxalwGq2H7YwhB4t59BUq8JqAz.node20?menuNo=4050200" },
  { name: "교육부", url: "https://www.moe.go.kr/boardCnts/listRenew.do?boardID=194&m=020602&s=moe" },
  { name: "과학기술정보통신부", url: "https://www.msit.go.kr/bbs/list.do?sCode=user&mPid=121&mId=125" },
  { name: "외교부", url: "https://www.mofa.go.kr/www/brd/m_4079/list.do" },
  { name: "통일부", url: "https://www.unikorea.go.kr/unikorea/notify/recruit/" },
  { name: "법무부", url: "https://www.moj.go.kr/moj/225/subview.do" },
  { name: "국방부", url: "https://www.mnd.go.kr/user/boardList.action?boardId=I_26382&mcategoryId=&id=mnd_020403000000" },
  { name: "행정안전부", url: "https://www.mois.go.kr/frt/bbs/type013/commonSelectBoardList.do?bbsId=BBSMSTR_000000000006" },
  { name: "국가보훈부", url: "https://www.mpva.go.kr/mpva/selectBbsNttList.do?bbsNo=360&key=1801" },
  { name: "문화체육관광부", url: "https://www.mcst.go.kr/kor/s_notice/notice/jobList.jsp" },
  { name: "농림축산식품부", url: "https://www.mafra.go.kr/home/5111/subview.do?enc=Zm5jdDF8QEB8JTJGYmJzJTJGaG9tZSUyRjc5NCUyRmFydGNsTGlzdC5kbyUzRg%3D%3D" },
  { name: "산업통상자원부", url: "https://www.motie.go.kr/kor/article/ATCL2527aa115" },
  { name: "보건복지부", url: "https://www.mohw.go.kr/board.es?mid=a10501010400&bid=0003&cg_code=C02" },
  { name: "환경부", url: "https://www.me.go.kr/home/web/index.do?menuId=10530" },
  { name: "고용노동부", url: "https://www.moel.go.kr/news/notice/noticeList.do?searchDivCd=004" },
  { name: "여성가족부", url: "https://www.mogef.go.kr/nw/ntc/nw_ntc_s001.do?div1=13&div3=10" },
  { name: "국토교통부", url: "https://www.molit.go.kr/USR/BORD0201/m_81/BRD.jsp" },
  { name: "인사혁신처", url: "https://www.mpm.go.kr/mpm/info/infoJobs/jobsBoard/?mode=list&boardId=bbs_0000000000000118&category=%EC%B1%84%EC%9A%A9" },
  { name: "법제처", url: "https://www.moleg.go.kr/board.es?mid=a10504000000&bid=0010" },
  { name: "식품의약품안전처", url: "https://www.nifds.go.kr/brd/m_22/list.do?page=1&srchFr=&srchTo=&srchWord=&srchTp=&itm_seq_1=0&itm_seq_2=0&multi_itm_seq=0&company_cd=&company_nm=" },
  { name: "공정거래위원회", url: "https://www.ftc.go.kr/www/selectBbsNttList.do?bordCd=4&key=14" },
  { name: "국민권익위원회", url: "https://www.acrc.go.kr/board.es?mid=a10401020000&bid=2B" },
  { name: "금융위원회", url: "https://www.fsc.go.kr/no010104" },
  { name: "개인정보보호위원회", url: "https://www.pipc.go.kr/np/cop/bbs/selectBoardList.do?bbsId=BS208&mCode=C010020000" },
  { name: "원자력안전위원회", url: "https://www.nssc.go.kr/ko/cms/FR_CON/index.do?MENU_ID=180" }
];

// 샘플 채용공고 데이터
const SAMPLE_JOB_POSTINGS = [
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
    applicationPeriodStart: new Date("2024-01-15"),
    applicationPeriodEnd: new Date("2024-03-15"),
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
    applicationPeriodStart: new Date("2024-01-20"),
    applicationPeriodEnd: new Date("2024-03-25"),
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
    applicationPeriodStart: new Date("2024-02-01"),
    applicationPeriodEnd: new Date("2024-04-05"),
    contact: "044-202-7100",
    originalUrl: "https://www.moel.go.kr/news/notice/noticeList.do",
    pdfUrl: "/api/pdfs/moel-labor-researcher.pdf",
    isUrgent: false,
    isNew: true,
  }
];

export async function initializeMinistryUrls(): Promise<void> {
  try {
    // 기존 부처 URL 데이터가 있는지 확인
    const [existingCount] = await db.select({ count: count() }).from(ministryUrls);
    
    if (existingCount.count === 0) {
      console.log("🏛️ Initializing ministry URLs...");
      
      // 부처 URL 데이터 삽입
      await db.insert(ministryUrls).values(
        MINISTRY_URLS.map(ministry => ({
          name: ministry.name,
          url: ministry.url,
          isActive: true,
        }))
      );
      
      console.log(`✅ Initialized ${MINISTRY_URLS.length} ministry URLs`);
    } else {
      console.log(`📋 Ministry URLs already initialized (${existingCount.count} entries)`);
    }
  } catch (error) {
    console.error("❌ Error initializing ministry URLs:", error);
    throw error;
  }
}

export async function initializeSampleJobPostings(): Promise<void> {
  try {
    // 기존 채용공고 데이터가 있는지 확인
    const [existingCount] = await db.select({ count: count() }).from(jobPostings);
    
    if (existingCount.count === 0) {
      console.log("📋 Initializing sample job postings...");
      
      // 샘플 채용공고 데이터 삽입
      await db.insert(jobPostings).values(SAMPLE_JOB_POSTINGS);
      
      console.log(`✅ Initialized ${SAMPLE_JOB_POSTINGS.length} sample job postings`);
    } else {
      console.log(`📄 Job postings already exist (${existingCount.count} entries)`);
    }
  } catch (error) {
    console.error("❌ Error initializing sample job postings:", error);
    throw error;
  }
}

export async function initializeDatabase(): Promise<void> {
  console.log("🚀 Starting database initialization...");
  
  try {
    await initializeMinistryUrls();
    await initializeSampleJobPostings();
    
    console.log("✅ Database initialization completed successfully");
  } catch (error) {
    console.error("❌ Database initialization failed:", error);
    throw error;
  }
}