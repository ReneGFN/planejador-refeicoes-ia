import { type ImageItem, PhoneCarousel } from "@/components/ui/phone-mockups-1-utils/phone-carousel";

const demoImages: ImageItem[] = [
  { src: "/demo/screens/01-inicio.png", alt: "Tela inicial do Refeição Fácil", label: "Início" },
  { src: "/demo/screens/02-pedido.png", alt: "Formulário guiado para montar um pedido", label: "Planejar" },
  { src: "/demo/screens/03-resultado.png", alt: "Sugestões de refeições geradas pelo aplicativo", label: "Sugestões" },
  { src: "/demo/screens/04-planos.png", alt: "Plano salvo com ingredientes e modo de preparo", label: "Planos" },
  { src: "/demo/screens/05-foto.png", alt: "Reconhecimento assistido de ingredientes por foto", label: "Foto" },
  { src: "/demo/screens/06-diario.png", alt: "Diário de refeições consumidas", label: "Diário" },
  { src: "/demo/screens/07-compras.png", alt: "Lista de compras", label: "Compras" },
  { src: "/demo/screens/08-despensa.png", alt: "Itens cadastrados na despensa", label: "Despensa" },
  { src: "/demo/screens/09-configuracoes.png", alt: "Configurações e escolha de tema", label: "Configurações" },
  { src: "/demo/screens/10-personalizacao.png", alt: "Preferências de personalização", label: "Personalização" },
  { src: "/demo/screens/11-erros.png", alt: "Histórico de mensagens de erro da sessão", label: "Erros" },
];

export default function PhoneMockupBasic() {
  return <PhoneCarousel images={demoImages} />;
}
