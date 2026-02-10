import { MessageCircle } from "lucide-react";

export function WhatsAppButton() {
  const phoneNumber = "971523133512";
  const message = encodeURIComponent("Hi! I need help with BarterGram marketplace.");
  const whatsappUrl = `https://wa.me/${phoneNumber}?text=${message}`;

  return (
    <a
      href={whatsappUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-[#25D366] flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95"
      data-testid="button-whatsapp-support"
      aria-label="Chat on WhatsApp"
    >
      <MessageCircle className="h-7 w-7 text-white" />
    </a>
  );
}
