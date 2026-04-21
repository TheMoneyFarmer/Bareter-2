import { MessageCircle } from "lucide-react";

export function WhatsAppButton() {
  const phoneNumber = "971523133512";
  const message = encodeURIComponent("Hi! I need help with Bareter marketplace.");
  const whatsappUrl = `https://wa.me/${phoneNumber}?text=${message}`;

  return (
    <a
      href={whatsappUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-40 h-12 w-12 md:h-14 md:w-14 rounded-full bg-[#25D366] flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95"
      data-testid="button-whatsapp-support"
      aria-label="Chat on WhatsApp"
    >
      <MessageCircle className="h-7 w-7 text-white" />
    </a>
  );
}
