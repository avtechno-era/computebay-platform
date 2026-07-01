"use client";
import {
	Activity,
	AlertOctagon,
	AlertTriangle,
	Archive,
	ArrowUpRight,
	Bell,
	Box,
	Briefcase,
	CheckCircle2,
	Cloud,
	Database,
	FileText,
	Globe,
	HardDrive,
	Info,
	KeyRound,
	LayoutGrid,
	LifeBuoy,
	type LucideIcon,
	Package,
	Receipt,
	RefreshCcw,
	RefreshCw,
	RotateCcw,
	Server,
	Store,
	Workflow,
} from "lucide-react";

// Maps the kebab-case icon names used by the design / curated catalog manifest to
// lucide-react components. Keeping an explicit map (rather than a dynamic import)
// keeps the bundle tree-shakeable.
const ICONS: Record<string, LucideIcon> = {
	activity: Activity,
	"alert-octagon": AlertOctagon,
	"alert-triangle": AlertTriangle,
	archive: Archive,
	"arrow-up-right": ArrowUpRight,
	bell: Bell,
	box: Box,
	briefcase: Briefcase,
	"check-circle-2": CheckCircle2,
	cloud: Cloud,
	database: Database,
	"file-text": FileText,
	globe: Globe,
	"hard-drive": HardDrive,
	info: Info,
	key: KeyRound,
	"layout-grid": LayoutGrid,
	"life-buoy": LifeBuoy,
	package: Package,
	receipt: Receipt,
	"refresh-ccw": RefreshCcw,
	"refresh-cw": RefreshCw,
	"rotate-ccw": RotateCcw,
	server: Server,
	store: Store,
	workflow: Workflow,
};

export const CbIcon = ({
	name,
	size = 16,
	style,
}: {
	name: string;
	size?: number;
	style?: React.CSSProperties;
}) => {
	const Icon = ICONS[name] ?? Box;
	return <Icon size={size} style={style} />;
};
