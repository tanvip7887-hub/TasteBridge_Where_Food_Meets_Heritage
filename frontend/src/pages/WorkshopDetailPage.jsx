import { useParams } from "react-router-dom";
import DineExperienceDiscovery from "../components/events/DineExperienceDiscovery.jsx";

const WorkshopDetailPage = () => {
  const { id } = useParams();
  return <DineExperienceDiscovery discoveryType="workshop" experienceId={id} />;
};

export default WorkshopDetailPage;
