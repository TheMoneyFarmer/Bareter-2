import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export type Language = "en" | "ar";

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  isRTL: boolean;
}

const translations: Record<Language, Record<string, string>> = {
  en: {
    "app.name": "Recipro",
    "app.tagline": "UAE's Premier Barter Marketplace",
    "nav.home": "Home",
    "nav.listings": "Listings",
    "nav.deals": "My Deals",
    "nav.profile": "Profile",
    "nav.admin": "Admin",
    "nav.login": "Login",
    "nav.register": "Register",
    "nav.logout": "Logout",
    "auth.email": "Email",
    "auth.password": "Password",
    "auth.fullName": "Full Name",
    "auth.login": "Login",
    "auth.register": "Register",
    "auth.forgotPassword": "Forgot Password?",
    "auth.resetPassword": "Reset Password",
    "auth.verifyEmail": "Verify Email",
    "listing.create": "Create Listing",
    "listing.offer": "Offer",
    "listing.request": "Request",
    "listing.title": "Title",
    "listing.description": "Description",
    "listing.category": "Category",
    "listing.location": "Location",
    "listing.value": "Value (AED)",
    "listing.images": "Images",
    "listing.verified": "Verified Only",
    "listing.search": "Search listings...",
    "deal.propose": "Propose Trade",
    "deal.accept": "Accept",
    "deal.reject": "Reject",
    "deal.complete": "Mark as Delivered",
    "deal.status.draft": "Draft",
    "deal.status.proposed": "Proposed",
    "deal.status.accepted": "Accepted",
    "deal.status.in_progress": "In Progress",
    "deal.status.delivery_proof": "Awaiting Proof",
    "deal.status.completed": "Completed",
    "deal.status.cancelled": "Cancelled",
    "deal.uploadProof": "Upload Delivery Proof",
    "deal.payFee": "Pay Success Fee",
    "deal.feeInfo": "12% of smaller value (min AED 100)",
    "profile.whatIOffer": "What I Offer",
    "profile.whatINeed": "What I Need",
    "profile.portfolio": "Portfolio",
    "profile.ratings": "Ratings & Reviews",
    "profile.verified": "Verified Business",
    "profile.edit": "Edit Profile",
    "rating.rate": "Rate Your Experience",
    "rating.review": "Write a Review",
    "rating.submit": "Submit Rating",
    "common.save": "Save",
    "common.cancel": "Cancel",
    "common.delete": "Delete",
    "common.loading": "Loading...",
    "common.error": "Error",
    "common.success": "Success",
    "common.aed": "AED",
    "common.vat": "VAT (5%)",
    "footer.howItWorks": "How It Works",
    "footer.pricing": "Pricing",
    "footer.help": "Help Center",
    "footer.faq": "FAQ",
    "footer.terms": "Terms of Service",
    "footer.privacy": "Privacy Policy",
    "onboarding.step1": "Basic Info",
    "onboarding.step2": "What You Offer",
    "onboarding.step3": "What You Need",
    "onboarding.step4": "Profile Photo",
    "onboarding.next": "Next",
    "onboarding.back": "Back",
    "onboarding.finish": "Complete Setup",
    "admin.users": "Users",
    "admin.listings": "Listings",
    "admin.deals": "Deals",
    "admin.analytics": "Analytics",
    "admin.verify": "Verify User",
    "admin.flag": "Flag Listing",
    "invoice.download": "Download Tax Invoice",
    "invoice.vatNote": "Users are responsible for issuing official VAT invoices",
  },
  ar: {
    "app.name": "ريسيبرو",
    "app.tagline": "سوق المقايضة الأول في الإمارات",
    "nav.home": "الرئيسية",
    "nav.listings": "القوائم",
    "nav.deals": "صفقاتي",
    "nav.profile": "الملف الشخصي",
    "nav.admin": "الإدارة",
    "nav.login": "تسجيل الدخول",
    "nav.register": "التسجيل",
    "nav.logout": "تسجيل الخروج",
    "auth.email": "البريد الإلكتروني",
    "auth.password": "كلمة المرور",
    "auth.fullName": "الاسم الكامل",
    "auth.login": "تسجيل الدخول",
    "auth.register": "التسجيل",
    "auth.forgotPassword": "نسيت كلمة المرور؟",
    "auth.resetPassword": "إعادة تعيين كلمة المرور",
    "auth.verifyEmail": "تأكيد البريد الإلكتروني",
    "listing.create": "إنشاء قائمة",
    "listing.offer": "عرض",
    "listing.request": "طلب",
    "listing.title": "العنوان",
    "listing.description": "الوصف",
    "listing.category": "الفئة",
    "listing.location": "الموقع",
    "listing.value": "القيمة (درهم)",
    "listing.images": "الصور",
    "listing.verified": "موثق فقط",
    "listing.search": "البحث في القوائم...",
    "deal.propose": "اقتراح صفقة",
    "deal.accept": "قبول",
    "deal.reject": "رفض",
    "deal.complete": "تأكيد التسليم",
    "deal.status.draft": "مسودة",
    "deal.status.proposed": "مقترح",
    "deal.status.accepted": "مقبول",
    "deal.status.in_progress": "قيد التنفيذ",
    "deal.status.delivery_proof": "بانتظار الإثبات",
    "deal.status.completed": "مكتمل",
    "deal.status.cancelled": "ملغي",
    "deal.uploadProof": "رفع إثبات التسليم",
    "deal.payFee": "دفع رسوم النجاح",
    "deal.feeInfo": "12٪ من القيمة الأقل (الحد الأدنى 100 درهم)",
    "profile.whatIOffer": "ما أقدمه",
    "profile.whatINeed": "ما أحتاجه",
    "profile.portfolio": "معرض الأعمال",
    "profile.ratings": "التقييمات والمراجعات",
    "profile.verified": "عمل موثق",
    "profile.edit": "تعديل الملف",
    "rating.rate": "قيم تجربتك",
    "rating.review": "اكتب مراجعة",
    "rating.submit": "إرسال التقييم",
    "common.save": "حفظ",
    "common.cancel": "إلغاء",
    "common.delete": "حذف",
    "common.loading": "جاري التحميل...",
    "common.error": "خطأ",
    "common.success": "نجاح",
    "common.aed": "درهم",
    "common.vat": "ضريبة القيمة المضافة (5٪)",
    "footer.howItWorks": "كيف يعمل",
    "footer.pricing": "الأسعار",
    "footer.help": "مركز المساعدة",
    "footer.faq": "الأسئلة الشائعة",
    "footer.terms": "شروط الخدمة",
    "footer.privacy": "سياسة الخصوصية",
    "onboarding.step1": "المعلومات الأساسية",
    "onboarding.step2": "ما تقدمه",
    "onboarding.step3": "ما تحتاجه",
    "onboarding.step4": "صورة الملف الشخصي",
    "onboarding.next": "التالي",
    "onboarding.back": "السابق",
    "onboarding.finish": "إكمال الإعداد",
    "admin.users": "المستخدمين",
    "admin.listings": "القوائم",
    "admin.deals": "الصفقات",
    "admin.analytics": "التحليلات",
    "admin.verify": "توثيق المستخدم",
    "admin.flag": "تحديد القائمة",
    "invoice.download": "تحميل فاتورة الضريبة",
    "invoice.vatNote": "المستخدمون مسؤولون عن إصدار فواتير ضريبة القيمة المضافة الرسمية",
  },
};

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem("recipro-language");
    return (saved as Language) || "en";
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem("recipro-language", lang);
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = lang;
  };

  useEffect(() => {
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = language;
  }, [language]);

  const t = (key: string): string => {
    return translations[language][key] || translations.en[key] || key;
  };

  const isRTL = language === "ar";

  return (
    <I18nContext.Provider value={{ language, setLanguage, t, isRTL }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return context;
}
