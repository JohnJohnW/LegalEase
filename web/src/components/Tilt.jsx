import { motion } from 'framer-motion';

export default function Tilt({ children, max = 5, scale = 1.02, ...props }) {
  return (
    <motion.div
      whileHover={{
        rotateX: max,
        rotateY: max,
        scale,
      }}
      transition={{
        type: "spring",
        stiffness: 300,
        damping: 20
      }}
      {...props}
    >
      {children}
    </motion.div>
  );
}
