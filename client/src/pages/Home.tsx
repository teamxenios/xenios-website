import SeoHead from "@/components/SeoHead";
import HomeNext from "@/home/HomeNext";
import { HOME_SEO } from "@/home/content";

export default function Home() {
  return <>
    <SeoHead {...HOME_SEO} />
    <HomeNext />
  </>;
}
